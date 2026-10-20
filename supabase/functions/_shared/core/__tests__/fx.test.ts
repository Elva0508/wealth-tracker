import { describe, expect, it } from 'vitest';
import {
  botRateDateFromHeader,
  fxStatusFor,
  latestFetchedAt,
  parseBotCsv,
  parseErApiLatest,
  rateFor,
  toFixedString,
} from '../index.ts';
import { rates } from './helpers.ts';

// 依臺灣銀行 CSV 的欄位排列製作的測試資料（數字為虛構）
const BOT_CSV = [
  '﻿幣別,匯率,現金,即期,遠期10天,遠期30天,遠期60天,遠期90天,遠期120天,遠期150天,遠期180天,匯率,現金,即期,遠期10天,遠期30天,遠期60天,遠期90天,遠期120天,遠期150天,遠期180天',
  'USD,本行買入,32.12500,32.45000,32.40,32.35,32.30,32.25,32.20,32.15,32.10,本行賣出,32.79500,32.55000,32.50,32.45,32.40,32.35,32.30,32.25,32.20',
  'JPY,本行買入,0.20520,0.21180,0.211,0.210,0.209,0.208,0.207,0.206,0.205,本行賣出,0.21800,0.21580,0.215,0.214,0.213,0.212,0.211,0.210,0.209',
  'VND,本行買入,0.00102,0.00000,0,0,0,0,0,0,0,本行賣出,0.00142,0.00000,0,0,0,0,0,0,0',
  '',
].join('\r\n');

describe('臺灣銀行 CSV', () => {
  it('取即期買入與賣出的中間價', () => {
    const quotes = parseBotCsv(BOT_CSV, '2026-10-19');
    const usd = quotes.find((q) => q.currency === 'USD')!;
    expect(usd.spotBuy).toBe('32.450000');
    expect(usd.spotSell).toBe('32.550000');
    expect(usd.midRate).toBe('32.500000');
    expect(usd.source).toBe('bot');
    expect(usd.rateDate).toBe('2026-10-19');
    expect(quotes.find((q) => q.currency === 'JPY')!.midRate).toBe('0.213800');
  });

  it('即期匯率為 0 的幣別略過', () => {
    expect(parseBotCsv(BOT_CSV, '2026-10-19').map((q) => q.currency)).toEqual(['USD', 'JPY']);
  });

  it('標題格式改變時丟出錯誤，讓系統改用備援來源', () => {
    expect(() => parseBotCsv('Currency,Rate\nUSD,32', '2026-10-19')).toThrow(/標題格式/);
    expect(() => parseBotCsv('', '2026-10-19')).toThrow();
  });

  it('從下載檔名取出牌告日期', () => {
    expect(botRateDateFromHeader('attachment; filename=ExchangeRate@202610191600.csv')).toBe('2026-10-19');
    expect(botRateDateFromHeader('attachment')).toBeNull();
    expect(botRateDateFromHeader(null)).toBeNull();
  });
});

describe('ExchangeRate-API 備援', () => {
  it('把「1 新台幣 = x 外幣」轉成「1 外幣 = y 新台幣」', () => {
    const quotes = parseErApiLatest({
      result: 'success',
      base_code: 'TWD',
      time_last_update_unix: 1792368000, // 2026-10-19 00:00 UTC
      rates: { TWD: 1, USD: 0.03125, CHF: 0.025, BAD: 'x' },
    });
    expect(quotes.find((q) => q.currency === 'USD')!.midRate).toBe('32.000000');
    expect(quotes.find((q) => q.currency === 'CHF')!.midRate).toBe('40.000000');
    expect(quotes.some((q) => q.currency === 'TWD')).toBe(false);
    expect(quotes.every((q) => q.source === 'er_api' && q.spotBuy === null)).toBe(true);
    expect(quotes[0].rateDate).toBe('2026-10-19');
  });

  it('回應失敗或基準幣別不對時丟出錯誤', () => {
    expect(() => parseErApiLatest({ result: 'error', 'error-type': 'quota' })).toThrow(/quota/);
    expect(() => parseErApiLatest({ result: 'success', base_code: 'USD', rates: {} })).toThrow(/TWD/);
  });
});

describe('匯率查詢與狀態', () => {
  const now = new Date('2026-10-19T10:00:00Z');

  it('新台幣固定為 1，其他幣別查表，查不到回傳 null', () => {
    const table = rates({ USD: '32.5' });
    expect(toFixedString(rateFor(table, 'TWD')!, 0)).toBe('1');
    expect(toFixedString(rateFor(table, 'USD')!, 1)).toBe('32.5');
    expect(rateFor(table, 'EUR')).toBeNull();
  });

  it('規格案例 4：使用備援來源時標示 fallback', () => {
    expect(fxStatusFor(['USD'], rates({ USD: '32' }), now)).toBe('fresh');
    expect(fxStatusFor(['USD'], rates({ USD: '32' }, { source: 'er_api' }), now)).toBe('fallback');
  });

  it('規格案例 5：超過 36 小時沒更新標示 stale，完全沒有匯率標示 missing', () => {
    expect(fxStatusFor(['USD'], rates({ USD: '32' }, { fetchedAt: '2026-10-17T10:00:00Z' }), now)).toBe('stale');
    expect(fxStatusFor(['USD', 'EUR'], rates({ USD: '32' }), now)).toBe('missing');
  });

  it('只有新台幣時永遠是 fresh', () => {
    expect(fxStatusFor(['TWD'], rates({}), now)).toBe('fresh');
  });

  it('最近一次抓取時間', () => {
    expect(latestFetchedAt(rates({}))).toBeNull();
    expect(latestFetchedAt(rates({ USD: '32' }))).toBe('2026-10-19T08:00:00Z');
  });
});
