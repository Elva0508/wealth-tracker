// @ts-nocheck
// 自動產生的單一檔案版本，給 Supabase 後台網頁編輯器直接貼上部署用。
// 原始碼在 supabase/functions/fetch-fx/ 與 _shared/；請改原始碼，不要直接改這個檔案。

// supabase/functions/_shared/core/decimal.ts
var SCALE = 6;
var FACTOR = 10n ** BigInt(SCALE);
var ONE = FACTOR;
var DECIMAL_RE = /^([+-])?(\d+)(?:\.(\d+))?$/;
function roundDiv(numerator, denominator) {
  if (denominator === 0n) throw new RangeError("\u9664\u6578\u4E0D\u80FD\u70BA 0");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n * 2n + d) / (d * 2n);
  return negative ? -q : q;
}
function dec(value) {
  if (typeof value === "bigint") return value * FACTOR;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError(`\u4E0D\u662F\u6709\u6548\u7684\u6578\u5B57\uFF1A${value}`);
    return dec(value.toFixed(12));
  }
  const match = DECIMAL_RE.exec(value.trim());
  if (!match) throw new RangeError(`\u4E0D\u662F\u6709\u6548\u7684\u5C0F\u6578\uFF1A\u300C${value}\u300D`);
  const [, sign, intPart, fracPart = ""] = match;
  const digits = fracPart.padEnd(SCALE + 1, "0");
  const kept = BigInt(intPart + digits.slice(0, SCALE));
  const rest = digits.slice(SCALE);
  let result = kept;
  if (rest.length > 0 && rest[0] >= "5") result += 1n;
  return sign === "-" ? -result : result;
}
function div(a, b) {
  return roundDiv(a * FACTOR, b);
}
function round(a, digits) {
  if (digits < 0 || digits > SCALE) throw new RangeError(`\u5C0F\u6578\u4F4D\u6578\u5FC5\u9808\u4ECB\u65BC 0 \u5230 ${SCALE}`);
  const step = 10n ** BigInt(SCALE - digits);
  return roundDiv(a, step) * step;
}
function toFixedString(a, digits = SCALE) {
  const rounded = round(a, digits);
  const negative = rounded < 0n;
  const absValue = negative ? -rounded : rounded;
  const intPart = absValue / FACTOR;
  const fracAll = (absValue % FACTOR).toString().padStart(SCALE, "0");
  const frac = fracAll.slice(0, digits);
  const body = digits > 0 ? `${intPart}.${frac}` : `${intPart}`;
  return negative ? `-${body}` : body;
}

// supabase/functions/_shared/core/dates.ts
var TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1e3;
function taipeiDate(at) {
  return new Date(at.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

// supabase/functions/_shared/core/fx.ts
var BASE_CURRENCY = "TWD";
function midRate(spotBuy, spotSell) {
  return div(spotBuy + spotSell, dec("2"));
}
function parseBotCsv(csv, rateDate) {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length < 2) throw new Error("\u81FA\u7063\u9280\u884C CSV \u6C92\u6709\u8CC7\u6599\u5217");
  const header = splitCsvLine(lines[0]);
  const spotColumns = header.map((name, index) => name === "\u5373\u671F" ? index : -1).filter((index) => index >= 0);
  if (spotColumns.length < 2) {
    throw new Error(`\u81FA\u7063\u9280\u884C CSV \u6A19\u984C\u683C\u5F0F\u7121\u6CD5\u8FA8\u8B58\uFF1A${lines[0].slice(0, 80)}`);
  }
  const [buyColumn, sellColumn] = spotColumns;
  const quotes = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const currency = cells[0]?.trim().toUpperCase();
    if (!currency || !/^[A-Z]{3}$/.test(currency)) continue;
    const buyText = cells[buyColumn]?.trim() ?? "";
    const sellText = cells[sellColumn]?.trim() ?? "";
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
      source: "bot"
    });
  }
  if (quotes.length === 0) throw new Error("\u81FA\u7063\u9280\u884C CSV \u89E3\u6790\u5F8C\u6C92\u6709\u4EFB\u4F55\u5373\u671F\u532F\u7387");
  return quotes;
}
function botRateDateFromHeader(contentDisposition) {
  if (!contentDisposition) return null;
  const match = /(\d{4})(\d{2})(\d{2})\d{4}/.exec(contentDisposition);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}
function parseErApiLatest(json2) {
  if (typeof json2 !== "object" || json2 === null) throw new Error("ExchangeRate-API \u56DE\u61C9\u4E0D\u662F JSON \u7269\u4EF6");
  const body = json2;
  if (body.result !== "success") throw new Error(`ExchangeRate-API \u56DE\u61C9\u5931\u6557\uFF1A${String(body["error-type"] ?? body.result)}`);
  if (body.base_code !== BASE_CURRENCY) throw new Error(`ExchangeRate-API \u57FA\u6E96\u5E63\u5225\u61C9\u70BA TWD\uFF0C\u5BE6\u969B\u70BA ${String(body.base_code)}`);
  const rates = body.rates;
  if (!rates || typeof rates !== "object") throw new Error("ExchangeRate-API \u56DE\u61C9\u7F3A\u5C11 rates");
  const updatedUnix = typeof body.time_last_update_unix === "number" ? body.time_last_update_unix : null;
  const rateDate = taipeiDate(updatedUnix ? new Date(updatedUnix * 1e3) : /* @__PURE__ */ new Date());
  const quotes = [];
  for (const [currency, value] of Object.entries(rates)) {
    if (currency === BASE_CURRENCY || !/^[A-Z]{3}$/.test(currency)) continue;
    if (typeof value !== "number" || !(value > 0)) continue;
    quotes.push({
      currency,
      quoteCurrency: BASE_CURRENCY,
      rateDate,
      spotBuy: null,
      spotSell: null,
      midRate: toFixedString(div(ONE, dec(value))),
      source: "er_api"
    });
  }
  return quotes;
}
function isPositiveNumber(text) {
  return /^\d+(\.\d+)?$/.test(text) && Number(text) > 0;
}
function splitCsvLine(line) {
  const cells = [];
  let current = "";
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
    } else if (ch === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

// supabase/functions/_shared/core/export.ts
var CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

// supabase/functions/_shared/auth.ts
import { createClient } from "npm:@supabase/supabase-js@2";
function serviceClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false }
  });
}
async function identifyCaller(req) {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const given = req.headers.get("x-cron-secret");
  if (cronSecret && given && timingSafeEqual(given, cronSecret)) return { type: "cron" };
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false }
    });
    const { data, error } = await client.auth.getUser();
    if (!error && data.user) return { type: "user", userId: data.user.id };
  }
  return { type: "anonymous" };
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function requireEnv(name) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`\u7F3A\u5C11\u74B0\u5883\u8B8A\u6578 ${name}`);
  return value;
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// supabase/functions/fetch-fx/index.ts
var BOT_URL = "https://rate.bot.com.tw/xrt/flcsv/0/day";
var ER_API_URL = "https://open.er-api.com/v6/latest/TWD";
var USER_REFRESH_COOLDOWN_MINUTES = 60;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await identifyCaller(req);
  if (caller.type === "anonymous") return json({ error: "unauthorized" }, 401);
  const db = serviceClient();
  if (caller.type === "user") {
    const { data: latest } = await db.from("fx_rates").select("fetched_at").order("fetched_at", { ascending: false }).limit(1).maybeSingle();
    const ageMinutes = latest ? (Date.now() - new Date(latest.fetched_at).getTime()) / 6e4 : Infinity;
    if (ageMinutes < USER_REFRESH_COOLDOWN_MINUTES) return json({ skipped: true, reason: "recently_updated" });
  }
  const result = {};
  const quotes = [];
  let botCurrencies = /* @__PURE__ */ new Set();
  try {
    const botQuotes = await fetchBot();
    quotes.push(...botQuotes);
    botCurrencies = new Set(botQuotes.map((q) => q.currency));
    result.bot = botQuotes.length;
  } catch (error) {
    result.botError = String(error);
    console.error("\u81FA\u7063\u9280\u884C\u532F\u7387\u6293\u53D6\u5931\u6557", error);
  }
  const { data: heldRows, error: heldError } = await db.from("balance_items").select("currency").neq("currency", "TWD");
  if (heldError) console.error("\u8B80\u53D6\u6301\u6709\u5E63\u5225\u5931\u6557", heldError);
  const held = (heldRows ?? []).map((r) => r.currency);
  const uncovered = [...new Set(held)].filter(
    (c) => !botCurrencies.has(c)
  );
  if (botCurrencies.size === 0 || uncovered.length > 0) {
    try {
      const erQuotes = await fetchErApi();
      const needed = botCurrencies.size === 0 ? erQuotes : erQuotes.filter((q) => uncovered.includes(q.currency));
      quotes.push(...needed);
      result.erApi = needed.length;
    } catch (error) {
      result.erApiError = String(error);
      console.error("ExchangeRate-API \u532F\u7387\u6293\u53D6\u5931\u6557", error);
    }
  }
  if (quotes.length === 0) {
    return json({ ok: false, ...result }, 502);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const { error: upsertError } = await db.from("fx_rates").upsert(
    quotes.map((q) => ({
      currency: q.currency,
      quote_currency: q.quoteCurrency,
      rate_date: q.rateDate,
      spot_buy: q.spotBuy,
      spot_sell: q.spotSell,
      mid_rate: q.midRate,
      source: q.source,
      fetched_at: now
    })),
    { onConflict: "currency,quote_currency,rate_date,source" }
  );
  if (upsertError) return json({ ok: false, error: upsertError.message, ...result }, 500);
  return json({ ok: true, saved: quotes.length, ...result });
});
async function fetchBot() {
  const res = await fetch(BOT_URL, { signal: AbortSignal.timeout(15e3) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = new TextDecoder("utf-8").decode(await res.arrayBuffer());
  const rateDate = botRateDateFromHeader(res.headers.get("content-disposition")) ?? taipeiDate(/* @__PURE__ */ new Date());
  return parseBotCsv(text, rateDate);
}
async function fetchErApi() {
  const res = await fetch(ER_API_URL, { signal: AbortSignal.timeout(15e3) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseErApiLatest(await res.json());
}
