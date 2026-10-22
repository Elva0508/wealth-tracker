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

// supabase/functions/_shared/core/format.ts
function displayDigits(currency, baseCurrency = "TWD") {
  return currency === baseCurrency ? 0 : 2;
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
var CATEGORY_GROUPS = ["liquid", "investment", "fixed", "receivable", "liability"];
var ASSET_GROUPS = ["liquid", "investment", "fixed", "receivable"];
var GROUP_CATEGORIES = {
  liquid: ["cash", "ewallet", "bank", "liquid_other"],
  investment: ["fund", "stock", "crypto", "metal", "investment_other"],
  fixed: ["real_estate", "fixed_other"],
  receivable: ["lending", "receivable_other"],
  liability: ["credit_card", "loan", "payable", "liability_other"]
};
var ASSET_CATEGORIES = ASSET_GROUPS.flatMap((g) => GROUP_CATEGORIES[g]);
var LIABILITY_CATEGORIES = GROUP_CATEGORIES.liability;
var CATEGORIES = [...ASSET_CATEGORIES, ...LIABILITY_CATEGORIES];
function groupOf(category) {
  return CATEGORY_GROUPS.find((g) => GROUP_CATEGORIES[g].includes(category));
}
function kindOf(category) {
  return groupOf(category) === "liability" ? "liability" : "asset";
}
function valueItem(item, rates, baseCurrency = BASE_CURRENCY) {
  const amountDec = dec(item.amount);
  const rate = rateFor(rates, item.currency, baseCurrency);
  return { ...item, amountDec, rate, amountBase: rate === null ? null : mul(amountDec, rate) };
}
function summarize(items, rates, baseCurrency = BASE_CURRENCY) {
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c, { category: c, total: ZERO, count: 0 }]));
  const groups = Object.fromEntries(CATEGORY_GROUPS.map((g) => [g, { group: g, total: ZERO, count: 0 }]));
  const valued = [];
  const missing = /* @__PURE__ */ new Set();
  let totalAssets = ZERO;
  let totalLiabilities = ZERO;
  for (const item of items) {
    if (item.status !== "active") continue;
    const v = valueItem(item, rates, baseCurrency);
    valued.push(v);
    const group = groupOf(item.category);
    categories[item.category].count += 1;
    groups[group].count += 1;
    if (v.amountBase === null) {
      missing.add(item.currency);
      continue;
    }
    categories[item.category].total += v.amountBase;
    groups[group].total += v.amountBase;
    if (kindOf(item.category) === "asset") totalAssets += v.amountBase;
    else totalLiabilities += v.amountBase;
  }
  return {
    baseCurrency,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    categories,
    groups,
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

// supabase/functions/_shared/core/loan.ts
function modeHasTerm(mode) {
  return mode === "annuity" || mode === "equal_principal" || mode === "bullet";
}
var MAX_PERIODS = 600;
var HP = 10n ** 18n;
var RATE_DENOMINATOR = 1200n * ONE;
var dayMs = 864e5;
function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs);
}
function addMonths(date, months, day) {
  const [y, m] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total % 12 + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}
function dueDate(loan, k) {
  return paymentDateAt(loan.firstPaymentDate, k);
}
function monthlyInterest(balance, ratePercent) {
  return roundDiv(balance * ratePercent, RATE_DENOMINATOR);
}
function dailyInterest(balance, ratePercent, days) {
  return roundDiv(balance * ratePercent * BigInt(days), 36500n * ONE);
}
function powHP(base, exponent) {
  let result = HP;
  let b = base;
  let e = exponent;
  while (e > 0) {
    if (e & 1) result = roundDiv(result * b, HP);
    b = roundDiv(b * b, HP);
    e >>= 1;
  }
  return result;
}
function annuityPayment(balance, ratePercent, periods) {
  if (periods <= 0) return balance;
  if (ratePercent === ZERO) return roundDiv(balance, BigInt(periods));
  const r = roundDiv(ratePercent * HP, RATE_DENOMINATOR);
  const growth = powHP(HP + r, periods);
  return roundDiv(balance * r * growth, HP * (growth - HP));
}
var byDate = (list, key) => [...list].sort((a, b) => key(a).localeCompare(key(b)));
function lastOnOrBefore(sorted, key, date) {
  let found = null;
  for (const item of sorted) {
    if (key(item) <= date) found = item;
    else break;
  }
  return found;
}
function buildSchedule(loan, until) {
  const digits = displayDigits(loan.currency);
  const money = (value) => round(value, digits);
  const modes = byDate(loan.modeChanges, (m) => m.effectiveDate);
  const rates = byDate(loan.rateChanges, (r) => r.effectiveDate);
  const adjustments = byDate(loan.adjustments, (a) => a.date);
  const rateAt = (date) => {
    const found = lastOnOrBefore(rates, (r) => r.effectiveDate, date) ?? rates[0];
    return found ? dec(found.annualRate) : ZERO;
  };
  const rows = [];
  let balance = dec(loan.principal);
  let paidOffAt = null;
  let nextAdjustment = 0;
  let modeIndex = -1;
  let periodInMode = 0;
  let fixedPayment = null;
  let fixedPrincipal = null;
  let recast = true;
  let lastRate = null;
  let unpaidInterest = ZERO;
  const applyAdjustment = (adj) => {
    const before = balance;
    const amount = dec(adj.amount);
    if (adj.kind === "prepayment") {
      const paid = amount > balance ? balance : amount;
      balance -= paid;
      if (adj.keep === "term") recast = true;
    } else {
      balance = amount;
      recast = true;
    }
    rows.push({
      type: adj.kind,
      date: adj.date,
      mode: modes[modeIndex]?.mode ?? null,
      period: null,
      periodsInMode: null,
      rate: rateAt(adj.date),
      principal: before - balance,
      interest: ZERO,
      payment: adj.kind === "prepayment" ? before - balance : ZERO,
      balance
    });
    if (balance === ZERO) paidOffAt = adj.date;
  };
  const applyAdjustmentsBefore = (date, inclusive) => {
    while (nextAdjustment < adjustments.length && paidOffAt === null) {
      const adj = adjustments[nextAdjustment];
      if (adj.date <= loan.startDate) {
        nextAdjustment += 1;
        continue;
      }
      if (inclusive ? adj.date > date : adj.date >= date) break;
      applyAdjustment(adj);
      nextAdjustment += 1;
    }
  };
  let periodStart = loan.startDate;
  for (let k = 0; k < MAX_PERIODS * 2 && paidOffAt === null; k += 1) {
    const due = dueDate(loan, k);
    if (due <= loan.startDate) continue;
    if (due > until) break;
    const openingBalance = balance;
    applyAdjustmentsBefore(due, false);
    if (paidOffAt !== null) break;
    const current = lastOnOrBefore(modes, (m) => m.effectiveDate, due) ?? modes[0];
    if (!current) break;
    const currentIndex = modes.indexOf(current);
    let accrualFrom = periodStart;
    if (currentIndex !== modeIndex) {
      const previous = modes[modeIndex];
      if (previous?.mode === "defer_all" && current.effectiveDate > periodStart) accrualFrom = current.effectiveDate;
      modeIndex = currentIndex;
      periodInMode = 0;
      fixedPayment = null;
      fixedPrincipal = null;
      recast = true;
    }
    const rate = rateAt(periodStart);
    if (current.mode === "defer_all") {
      periodStart = due;
      applyAdjustmentsBefore(due, true);
      continue;
    }
    if (daysBetween(accrualFrom, due) <= 0) {
      periodStart = due;
      applyAdjustmentsBefore(due, true);
      continue;
    }
    const fullMonth = k > 0 && accrualFrom === dueDate(loan, k - 1) || addMonths(accrualFrom, 1, Number(accrualFrom.slice(8, 10))) === due;
    const accrued = fullMonth ? monthlyInterest(openingBalance, rate) : dailyInterest(openingBalance, rate, daysBetween(accrualFrom, due));
    periodInMode += 1;
    const term = current.termMonths ?? 0;
    const remaining = Math.max(1, term - periodInMode + 1);
    let principal = ZERO;
    let interest = ZERO;
    let payNow = true;
    if (current.mode === "interest_only") {
      unpaidInterest += accrued;
      const every = Math.max(1, current.interestEvery ?? 1);
      payNow = periodInMode % every === 0;
      if (payNow) {
        interest = money(unpaidInterest);
        unpaidInterest = ZERO;
      }
    } else {
      interest = money(unpaidInterest + accrued);
      unpaidInterest = ZERO;
      if (current.mode === "annuity") {
        if (recast || fixedPayment === null || lastRate !== null && rate !== lastRate) {
          fixedPayment = money(annuityPayment(balance, rate, remaining));
        }
        principal = fixedPayment - interest;
        if (principal < ZERO) principal = ZERO;
      } else if (current.mode === "equal_principal") {
        if (recast || fixedPrincipal === null) fixedPrincipal = money(roundDiv(balance, BigInt(remaining)));
        principal = fixedPrincipal;
      }
      if (remaining <= 1 || principal >= balance) principal = balance;
    }
    recast = false;
    lastRate = rate;
    if (payNow) {
      balance -= principal;
      rows.push({
        type: "payment",
        date: due,
        mode: current.mode,
        period: periodInMode,
        periodsInMode: modeHasTerm(current.mode) ? term : null,
        rate,
        principal,
        interest,
        payment: principal + interest,
        balance
      });
      if (balance === ZERO) paidOffAt = due;
    }
    periodStart = due;
    applyAdjustmentsBefore(due, true);
  }
  if (paidOffAt === null) applyAdjustmentsBefore(until, true);
  return { rows, balance, paidOffAt };
}
function loanBalanceOn(loan, date) {
  if (date < loan.startDate) return dec(loan.principal);
  return buildSchedule(loan, date).balance;
}
function loansFromRows(loans, rates, modes, adjustments, currencyOfItem) {
  return loans.map((l) => ({
    id: l.id,
    itemId: l.item_id,
    currency: currencyOfItem(l.item_id) ?? "TWD",
    startDate: l.start_date,
    principal: l.principal,
    firstPaymentDate: l.first_payment_date,
    rateChanges: rates.filter((r) => r.loan_id === l.id).map((r) => ({ effectiveDate: r.effective_date, annualRate: r.annual_rate })),
    modeChanges: modes.filter((m) => m.loan_id === l.id).map((m) => ({
      effectiveDate: m.effective_date,
      mode: m.mode,
      termMonths: m.term_months,
      interestEvery: m.interest_every
    })),
    adjustments: adjustments.filter((a) => a.loan_id === l.id).map((a) => ({ date: a.adjust_date, kind: a.kind, amount: a.amount, keep: a.keep }))
  }));
}
function withLoanBalances(items, loans, date) {
  const byItem = new Map(loans.map((l) => [l.itemId, l]));
  return items.map((item) => {
    const loan = byItem.get(item.id);
    return loan ? { ...item, amount: toFixedString(loanBalanceOn(loan, date), 4) } : item;
  });
}
function paymentDateAt(firstPaymentDate, k) {
  return addMonths(firstPaymentDate, k, Number(firstPaymentDate.slice(8, 10)));
}

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
async function readAll(db, table, columns) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from(table).select(columns).order("id").range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data ?? []);
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await identifyCaller(req);
  if (caller.type !== "cron") return json({ error: "unauthorized" }, 401);
  const db = serviceClient();
  const runAt = /* @__PURE__ */ new Date();
  const { data: fxRows, error: fxError } = await db.from("fx_latest").select("currency, mid_rate:mid_rate::text, source, rate_date, fetched_at");
  if (fxError) return json({ ok: false, error: fxError.message }, 500);
  const rates = rateTableFromRows(fxRows ?? []);
  let loans;
  const itemsByUser = /* @__PURE__ */ new Map();
  try {
    const [itemRows, loanRows, rateRows, modeRows, adjustmentRows] = await Promise.all([
      readAll(
        db,
        "balance_items",
        "id, user_id, kind, category, name, currency, amount:amount::text, status"
      ),
      readAll(db, "loans", "id, item_id, start_date, principal:principal::text, first_payment_date"),
      readAll(db, "loan_rate_changes", "id, loan_id, effective_date, annual_rate:annual_rate::text"),
      readAll(db, "loan_mode_changes", "id, loan_id, effective_date, mode, term_months, interest_every"),
      readAll(db, "loan_adjustments", "id, loan_id, adjust_date, kind, amount:amount::text, keep")
    ]);
    for (const row of itemRows) {
      const list = itemsByUser.get(row.user_id) ?? [];
      list.push(row);
      itemsByUser.set(row.user_id, list);
    }
    const currencyOfItem = new Map(itemRows.map((i) => [i.id, i.currency.trim()]));
    loans = loansFromRows(loanRows, rateRows, modeRows, adjustmentRows, (id) => currencyOfItem.get(id));
  } catch (error) {
    return json({ ok: false, error: String(error) }, 500);
  }
  const snapshotDate = snapshotDateFor(runAt);
  let saved = 0;
  const failures = [];
  for (const [userId, items] of itemsByUser) {
    try {
      const snap = buildSnapshot(withLoanBalances(items, loans, snapshotDate), rates, runAt);
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
