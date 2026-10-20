/**
 * 匯率：解析資料來源、挑選要使用的匯率、判斷匯率是否為最新。
 *
 * 規則（見規格「幣別與匯率」）：
 * - 方向固定為「1 外幣 = x 新台幣」
 * - 主要來源：臺灣銀行牌告匯率，使用即期買入與賣出的中間價
 * - 備援來源：ExchangeRate-API 開放端點（只有一個市場匯率，沒有買賣價）
 */
import { type Dec, ONE, dec, div, toFixedString } from './decimal.ts';
import { taipeiDate } from './dates.ts';

export type FxSource = 'bot' | 'er_api';
export type FxStatus = 'fresh' | 'fallback' | 'stale' | 'missing';

export const BASE_CURRENCY = 'TWD';

/** 一筆準備寫入 fx_rates 資料表的匯率 */
export interface FxQuote {
  currency: string;
  quoteCurrency: string;
  rateDate: string;
  spotBuy: string | null;
  spotSell: string | null;
  midRate: string;
  source: FxSource;
}

/** 從資料庫 fx_latest 檢視表讀到的一列（數字欄位以字串讀取） */
export interface FxRow {
  currency: string;
  mid_rate: string;
  source: FxSource;
  rate_date: string;
  fetched_at: string;
}

export interface RateEntry {
  currency: string;
  rate: Dec;
  source: FxSource;
  rateDate: string;
  fetchedAt: string;
}

/** 幣別 → 匯率。新台幣本身不需要存，查詢時直接回傳 1 */
export type RateTable = Map<string, RateEntry>;

/** 中間價 =（即期買入 + 即期賣出）÷ 2 */
export function midRate(spotBuy: Dec, spotSell: Dec): Dec {
  return div(spotBuy + spotSell, dec('2'));
}

/**
 * 解析臺灣銀行牌告匯率 CSV（https://rate.bot.com.tw/xrt/flcsv/0/day）。
 *
 * 檔案每列大致是：幣別, 本行買入, 現金, 即期, 遠期…, 本行賣出, 現金, 即期, 遠期…
 * 為了不依賴固定欄位位置，這裡從標題列找出兩個「即期」欄：第一個是買入、第二個是賣出。
 * 標題格式認不出來時直接丟出錯誤，讓呼叫端改用備援來源，而不是存進錯的數字。
 */
export function parseBotCsv(csv: string, rateDate: string): FxQuote[] {
  const lines = csv
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) throw new Error('臺灣銀行 CSV 沒有資料列');

  const header = splitCsvLine(lines[0]);
  const spotColumns = header
    .map((name, index) => (name === '即期' ? index : -1))
    .filter((index) => index >= 0);
  if (spotColumns.length < 2) {
    throw new Error(`臺灣銀行 CSV 標題格式無法辨識：${lines[0].slice(0, 80)}`);
  }
  const [buyColumn, sellColumn] = spotColumns;

  const quotes: FxQuote[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const currency = cells[0]?.trim().toUpperCase();
    if (!currency || !/^[A-Z]{3}$/.test(currency)) continue;

    const buyText = cells[buyColumn]?.trim() ?? '';
    const sellText = cells[sellColumn]?.trim() ?? '';
    // 有些幣別只有現金匯率，即期欄是 0 或空白，略過
    if (!isPositiveNumber(buyText) || !isPositiveNumber(sellText)) continue;

    const buy = dec(buyText);
    const sell = dec(sellText);
    quotes.push({
      currency,
      quoteCurrency: BASE_CURRENCY,
      rateDate,
      spotBuy: toFixedString(buy),
      spotSell: toFixedString(sell),
      midRate: toFixedString(midRate(buy, sell)),
      source: 'bot',
    });
  }
  if (quotes.length === 0) throw new Error('臺灣銀行 CSV 解析後沒有任何即期匯率');
  return quotes;
}

/**
 * 從臺灣銀行回應的 Content-Disposition 取出牌告時間，例如
 * attachment; filename=ExchangeRate@202610191600.csv → '2026-10-19'。
 * 取不到時回傳 null，由呼叫端改用台灣當天日期。
 */
export function botRateDateFromHeader(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const match = /(\d{4})(\d{2})(\d{2})\d{4}/.exec(contentDisposition);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * 解析 ExchangeRate-API 開放端點 https://open.er-api.com/v6/latest/TWD 的回應。
 * 回應中的 rates.USD = 0.0308 代表 1 新台幣 = 0.0308 美元，
 * 所以 1 美元 = 1 ÷ 0.0308 新台幣。
 */
export function parseErApiLatest(json: unknown): FxQuote[] {
  if (typeof json !== 'object' || json === null) throw new Error('ExchangeRate-API 回應不是 JSON 物件');
  const body = json as Record<string, unknown>;
  if (body.result !== 'success') throw new Error(`ExchangeRate-API 回應失敗：${String(body['error-type'] ?? body.result)}`);
  if (body.base_code !== BASE_CURRENCY) throw new Error(`ExchangeRate-API 基準幣別應為 TWD，實際為 ${String(body.base_code)}`);
  const rates = body.rates as Record<string, unknown> | undefined;
  if (!rates || typeof rates !== 'object') throw new Error('ExchangeRate-API 回應缺少 rates');

  const updatedUnix = typeof body.time_last_update_unix === 'number' ? body.time_last_update_unix : null;
  const rateDate = taipeiDate(updatedUnix ? new Date(updatedUnix * 1000) : new Date());

  const quotes: FxQuote[] = [];
  for (const [currency, value] of Object.entries(rates)) {
    if (currency === BASE_CURRENCY || !/^[A-Z]{3}$/.test(currency)) continue;
    if (typeof value !== 'number' || !(value > 0)) continue;
    quotes.push({
      currency,
      quoteCurrency: BASE_CURRENCY,
      rateDate,
      spotBuy: null,
      spotSell: null,
      midRate: toFixedString(div(ONE, dec(value))),
      source: 'er_api',
    });
  }
  return quotes;
}

/** 把資料庫的匯率列轉成查詢表 */
export function rateTableFromRows(rows: FxRow[]): RateTable {
  const table: RateTable = new Map();
  for (const row of rows) {
    table.set(row.currency, {
      currency: row.currency,
      rate: dec(row.mid_rate),
      source: row.source,
      rateDate: row.rate_date,
      fetchedAt: row.fetched_at,
    });
  }
  return table;
}

/** 查詢某幣別換算成新台幣的匯率；找不到時回傳 null（絕不能當成 0） */
export function rateFor(table: RateTable, currency: string, baseCurrency = BASE_CURRENCY): Dec | null {
  if (currency === baseCurrency) return ONE;
  return table.get(currency)?.rate ?? null;
}

/** 超過這個時間沒有成功抓到匯率，就標示「非最新」 */
export const STALE_AFTER_HOURS = 36;

/**
 * 判斷這次計算使用的匯率狀態，取最差的一個：
 * missing（有幣別完全沒有匯率）> stale（太久沒更新）> fallback（用到備援來源）> fresh
 */
export function fxStatusFor(
  currencies: Iterable<string>,
  table: RateTable,
  now: Date,
  baseCurrency = BASE_CURRENCY,
): FxStatus {
  let status: FxStatus = 'fresh';
  const rank: Record<FxStatus, number> = { fresh: 0, fallback: 1, stale: 2, missing: 3 };
  const worse = (next: FxStatus) => {
    if (rank[next] > rank[status]) status = next;
  };
  for (const currency of new Set(currencies)) {
    if (currency === baseCurrency) continue;
    const entry = table.get(currency);
    if (!entry) {
      worse('missing');
      continue;
    }
    const ageHours = (now.getTime() - new Date(entry.fetchedAt).getTime()) / 3_600_000;
    if (ageHours > STALE_AFTER_HOURS) worse('stale');
    if (entry.source === 'er_api') worse('fallback');
  }
  return status;
}

/** 最近一次成功抓取匯率的時間（畫面上顯示「更新於…」用） */
export function latestFetchedAt(table: RateTable): string | null {
  let latest: string | null = null;
  for (const entry of table.values()) {
    if (latest === null || entry.fetchedAt > latest) latest = entry.fetchedAt;
  }
  return latest;
}

function isPositiveNumber(text: string): boolean {
  return /^\d+(\.\d+)?$/.test(text) && Number(text) > 0;
}

/** 簡易 CSV 切欄（臺灣銀行的檔案沒有含逗號的欄位，但仍處理雙引號） */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}
