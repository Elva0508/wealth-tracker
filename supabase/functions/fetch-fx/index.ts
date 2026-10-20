/**
 * 更新匯率。
 *
 * 呼叫者：
 * - 排程（營業時間每小時、每日快照前）
 * - App：開啟時發現匯率超過 24 小時，會請求更新一次；一小時內已更新過就略過
 *
 * 流程：
 * 1. 抓臺灣銀行牌告 CSV → 成功就寫入 source = 'bot'
 * 2. 臺灣銀行失敗，或使用者持有臺灣銀行沒有的幣別 → 抓 ExchangeRate-API 寫入 source = 'er_api'
 * 3. 同一天同一來源重複抓取時，更新同一列（保留每天的歷史）
 */
import {
  type FxQuote,
  botRateDateFromHeader,
  parseBotCsv,
  parseErApiLatest,
  taipeiDate,
} from '../_shared/core/index.ts';
import { corsHeaders, identifyCaller, json, serviceClient } from '../_shared/auth.ts';

const BOT_URL = 'https://rate.bot.com.tw/xrt/flcsv/0/day';
const ER_API_URL = 'https://open.er-api.com/v6/latest/TWD';
const USER_REFRESH_COOLDOWN_MINUTES = 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const caller = await identifyCaller(req);
  if (caller.type === 'anonymous') return json({ error: 'unauthorized' }, 401);

  const db = serviceClient();

  // 使用者觸發時，最近一小時內已更新過就不再抓，避免頻繁呼叫外部網站
  if (caller.type === 'user') {
    const { data: latest } = await db
      .from('fx_rates')
      .select('fetched_at')
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const ageMinutes = latest ? (Date.now() - new Date(latest.fetched_at).getTime()) / 60_000 : Infinity;
    if (ageMinutes < USER_REFRESH_COOLDOWN_MINUTES) return json({ skipped: true, reason: 'recently_updated' });
  }

  const result: Record<string, unknown> = {};
  const quotes: FxQuote[] = [];

  let botCurrencies = new Set<string>();
  try {
    const botQuotes = await fetchBot();
    quotes.push(...botQuotes);
    botCurrencies = new Set(botQuotes.map((q) => q.currency));
    result.bot = botQuotes.length;
  } catch (error) {
    result.botError = String(error);
    console.error('臺灣銀行匯率抓取失敗', error);
  }

  // 使用者持有、但臺灣銀行沒有提供的幣別
  const { data: heldRows, error: heldError } = await db
    .from('balance_items')
    .select('currency')
    .neq('currency', 'TWD');
  if (heldError) console.error('讀取持有幣別失敗', heldError);
  const held = ((heldRows ?? []) as { currency: string }[]).map((r) => r.currency);
  const uncovered = [...new Set(held)].filter(
    (c) => !botCurrencies.has(c),
  );

  if (botCurrencies.size === 0 || uncovered.length > 0) {
    try {
      const erQuotes = await fetchErApi();
      // 臺灣銀行成功時，只補它沒有的幣別
      const needed = botCurrencies.size === 0 ? erQuotes : erQuotes.filter((q) => uncovered.includes(q.currency));
      quotes.push(...needed);
      result.erApi = needed.length;
    } catch (error) {
      result.erApiError = String(error);
      console.error('ExchangeRate-API 匯率抓取失敗', error);
    }
  }

  if (quotes.length === 0) {
    // 兩個來源都失敗：不寫入任何資料，App 會沿用最近一次的匯率並標示「非最新」
    return json({ ok: false, ...result }, 502);
  }

  const now = new Date().toISOString();
  const { error: upsertError } = await db.from('fx_rates').upsert(
    quotes.map((q) => ({
      currency: q.currency,
      quote_currency: q.quoteCurrency,
      rate_date: q.rateDate,
      spot_buy: q.spotBuy,
      spot_sell: q.spotSell,
      mid_rate: q.midRate,
      source: q.source,
      fetched_at: now,
    })),
    { onConflict: 'currency,quote_currency,rate_date,source' },
  );
  if (upsertError) return json({ ok: false, error: upsertError.message, ...result }, 500);

  return json({ ok: true, saved: quotes.length, ...result });
});

async function fetchBot(): Promise<FxQuote[]> {
  const res = await fetch(BOT_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = new TextDecoder('utf-8').decode(await res.arrayBuffer());
  const rateDate = botRateDateFromHeader(res.headers.get('content-disposition')) ?? taipeiDate(new Date());
  return parseBotCsv(text, rateDate);
}

async function fetchErApi(): Promise<FxQuote[]> {
  const res = await fetch(ER_API_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseErApiLatest(await res.json());
}
