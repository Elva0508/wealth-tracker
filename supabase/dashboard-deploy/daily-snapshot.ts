// @ts-nocheck
// 自動產生的單一檔案版本，給 Supabase 後台網頁編輯器直接貼上部署用。
// 原始碼在 supabase/functions/daily-snapshot/ 與 _shared/；請改原始碼，不要直接改這個檔案。

// supabase/functions/_shared/core/decimal.ts
var SCALE = 6;
var FACTOR = 10n ** BigInt(SCALE);
var ZERO = 0n;
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
function mul(a, b) {
  return roundDiv(a * b, FACTOR);
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
function addDays(date, days) {
  const d = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function snapshotDateFor(runAt) {
  return addDays(taipeiDate(runAt), -1);
}

// supabase/functions/_shared/core/fx.ts
var BASE_CURRENCY = "TWD";
function rateTableFromRows(rows) {
  const table = /* @__PURE__ */ new Map();
  for (const row of rows) {
    table.set(row.currency, {
      currency: row.currency,
      rate: dec(row.mid_rate),
      source: row.source,
      rateDate: row.rate_date,
      fetchedAt: row.fetched_at
    });
  }
  return table;
}
function rateFor(table, currency, baseCurrency = BASE_CURRENCY) {
  if (currency === baseCurrency) return ONE;
  return table.get(currency)?.rate ?? null;
}
var STALE_AFTER_HOURS = 36;
function fxStatusFor(currencies, table, now, baseCurrency = BASE_CURRENCY) {
  let status = "fresh";
  const rank = { fresh: 0, fallback: 1, stale: 2, missing: 3 };
  const worse = (next) => {
    if (rank[next] > rank[status]) status = next;
  };
  for (const currency of new Set(currencies)) {
    if (currency === baseCurrency) continue;
    const entry = table.get(currency);
    if (!entry) {
      worse("missing");
      continue;
    }
    const ageHours = (now.getTime() - new Date(entry.fetchedAt).getTime()) / 36e5;
    if (ageHours > STALE_AFTER_HOURS) worse("stale");
    if (entry.source === "er_api") worse("fallback");
  }
  return status;
}

// supabase/functions/_shared/core/balance.ts
var ASSET_CATEGORIES = ["cash_bank", "securities", "other_asset"];
var LIABILITY_CATEGORIES = ["loan", "daily_liability"];
function kindOf(category) {
  return ASSET_CATEGORIES.includes(category) ? "asset" : "liability";
}
function valueItem(item, rates, baseCurrency = BASE_CURRENCY) {
  const amountDec = dec(item.amount);
  const rate = rateFor(rates, item.currency, baseCurrency);
  return { ...item, amountDec, rate, amountBase: rate === null ? null : mul(amountDec, rate) };
}
function summarize(items, rates, baseCurrency = BASE_CURRENCY) {
  const categories = Object.fromEntries(
    [...ASSET_CATEGORIES, ...LIABILITY_CATEGORIES].map((c) => [c, { category: c, total: ZERO, count: 0 }])
  );
  const valued = [];
  const missing = /* @__PURE__ */ new Set();
  let totalAssets = ZERO;
  let totalLiabilities = ZERO;
  for (const item of items) {
    if (item.status !== "active") continue;
    const v = valueItem(item, rates, baseCurrency);
    valued.push(v);
    categories[item.category].count += 1;
    if (v.amountBase === null) {
      missing.add(item.currency);
      continue;
    }
    categories[item.category].total += v.amountBase;
    if (kindOf(item.category) === "asset") totalAssets += v.amountBase;
    else totalLiabilities += v.amountBase;
  }
  return {
    baseCurrency,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    categories,
    items: valued,
    missingCurrencies: [...missing].sort()
  };
}

// supabase/functions/_shared/core/snapshot.ts
function buildSnapshot(items, rates, runAt, baseCurrency = BASE_CURRENCY) {
  const summary = summarize(items, rates, baseCurrency);
  return {
    snapshotDate: snapshotDateFor(runAt),
    totalAssets: toFixedString(summary.totalAssets, 4),
    totalLiabilities: toFixedString(summary.totalLiabilities, 4),
    netWorth: toFixedString(summary.netWorth, 4),
    fxStatus: fxStatusFor(
      summary.items.map((i) => i.currency),
      rates,
      runAt,
      baseCurrency
    ),
    lines: summary.items.map((item) => ({
      itemId: item.id,
      category: item.category,
      currency: item.currency,
      amount: toFixedString(item.amountDec, 4),
      fxRate: item.rate === null ? null : toFixedString(item.rate),
      amountBase: item.amountBase === null ? null : toFixedString(item.amountBase, 4)
    }))
  };
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

// supabase/functions/daily-snapshot/index.ts
var PAGE_SIZE = 1e3;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await identifyCaller(req);
  if (caller.type !== "cron") return json({ error: "unauthorized" }, 401);
  const db = serviceClient();
  const runAt = /* @__PURE__ */ new Date();
  const { data: fxRows, error: fxError } = await db.from("fx_latest").select("currency, mid_rate:mid_rate::text, source, rate_date, fetched_at");
  if (fxError) return json({ ok: false, error: fxError.message }, 500);
  const rates = rateTableFromRows(fxRows ?? []);
  const itemsByUser = /* @__PURE__ */ new Map();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from("balance_items").select("id, user_id, kind, category, name, currency, amount:amount::text, status").order("id").range(from, from + PAGE_SIZE - 1);
    if (error) return json({ ok: false, error: error.message }, 500);
    for (const row of data ?? []) {
      const list = itemsByUser.get(row.user_id) ?? [];
      list.push(row);
      itemsByUser.set(row.user_id, list);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  let saved = 0;
  const failures = [];
  for (const [userId, items] of itemsByUser) {
    try {
      const snap = buildSnapshot(items, rates, runAt);
      const { error } = await db.rpc("save_snapshot", {
        p_user_id: userId,
        p_snapshot_date: snap.snapshotDate,
        p_total_assets: snap.totalAssets,
        p_total_liabilities: snap.totalLiabilities,
        p_net_worth: snap.netWorth,
        p_fx_status: snap.fxStatus,
        p_lines: snap.lines.map((l) => ({
          item_id: l.itemId,
          category: l.category,
          currency: l.currency,
          amount: l.amount,
          fx_rate: l.fxRate,
          amount_base: l.amountBase
        }))
      });
      if (error) throw new Error(error.message);
      saved += 1;
    } catch (error) {
      failures.push({ userId, error: String(error) });
      console.error(`\u4F7F\u7528\u8005 ${userId} \u5FEB\u7167\u5931\u6557`, error);
    }
  }
  return json({ ok: failures.length === 0, saved, failed: failures.length, failures }, failures.length ? 500 : 200);
});
