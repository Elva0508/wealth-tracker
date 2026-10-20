/**
 * 貸款還款表與餘額計算。純函式，前端與每日快照共用。
 *
 * 一筆貸款由這些資料決定：
 * - 起算日與起算本金：可以是撥款日與貸款金額，也可以是「某天的剩餘本金」（已經繳了一段時間的貸款）
 * - 第一次扣款日：之後每月同一天扣款；該月沒有這一天時取該月最後一天
 * - 利率變動：「從哪天起年利率改成幾 %」，第一筆就是起算時的利率
 * - 還款方式變動：「從哪天起改成哪種還款方式」。學貸每年申請展延時，再記一筆就好
 * - 調整：提前還款、或把餘額校正成銀行的實際數字
 *
 * 計算規則（和台灣銀行常見做法一致，畫面上也會說明）：
 * - 每期利息 = 期初本金 × 年利率 ÷ 12；不滿一個月的期間（例如第一期、緩繳結束那一期）按日計息：× 天數 ÷ 365
 * - 利率變動從生效日之後開始的那一期起適用
 * - 還款方式從生效日當天或之後的第一個扣款日起適用
 * - 緩繳本息：完全不用繳錢，也不計息（臺灣銀行就學貸款的規定）
 * - 只繳息（緩繳本金）：本金不動，可以每月或每 N 個月繳一次息（學貸是每年）
 * - 本息平均攤還：每期金額相同；利率變動或「期數不變」的提前還款後，用剩餘期數重算每期金額
 * - 本金平均攤還：每期本金相同，利息逐期減少
 * - 到期一次還本：每月繳息，最後一期還清本金
 * - 提前還款與校正餘額：發生在兩次扣款之間時，當期利息仍以期初本金計算
 * - 金額四捨五入到元（新台幣）或分（外幣）；最後一期把剩下的零頭一次還清
 */
import { type Dec, ONE, ZERO, dec, roundDiv, round, toFixedString } from './decimal.ts';
import { displayDigits } from './format.ts';
import { parseAmountInput } from './validation.ts';

export const REPAYMENT_MODES = ['defer_all', 'interest_only', 'annuity', 'equal_principal', 'bullet'] as const;
export type RepaymentMode = (typeof REPAYMENT_MODES)[number];

export const REPAYMENT_MODE_LABELS: Record<RepaymentMode, string> = {
  defer_all: '緩繳本息',
  interest_only: '只繳息（緩繳本金）',
  annuity: '本息平均攤還',
  equal_principal: '本金平均攤還',
  bullet: '到期一次還本',
};

/** 需要設定期數的還款方式 */
export function modeHasTerm(mode: RepaymentMode): boolean {
  return mode === 'annuity' || mode === 'equal_principal' || mode === 'bullet';
}

export interface RateChange {
  effectiveDate: string;
  /** 年利率 %，例如 '1.775' */
  annualRate: string;
}

export interface ModeChange {
  effectiveDate: string;
  mode: RepaymentMode;
  /** 本息平均攤還、本金平均攤還、到期一次還本：從這次切換起算的期數 */
  termMonths: number | null;
  /** 只繳息：幾個月繳一次息（1 = 每月、12 = 每年） */
  interestEvery: number | null;
}

export type AdjustmentKind = 'prepayment' | 'balance';

export interface LoanAdjustment {
  date: string;
  /** prepayment = 提前還款（amount 是多還的本金）；balance = 校正餘額（amount 是校正後的本金） */
  kind: AdjustmentKind;
  amount: string;
  /** 提前還款後：'term' = 期數不變、降低每期金額；'payment' = 每期金額不變、提早還清 */
  keep: 'term' | 'payment';
}

export interface Loan {
  currency: string;
  startDate: string;
  principal: string;
  firstPaymentDate: string;
  rateChanges: RateChange[];
  modeChanges: ModeChange[];
  adjustments: LoanAdjustment[];
}

export type ScheduleRowType = 'payment' | 'prepayment' | 'balance';

export interface ScheduleRow {
  type: ScheduleRowType;
  date: string;
  mode: RepaymentMode | null;
  /** 這個還款方式的第幾期；調整列為 null */
  period: number | null;
  /** 這個還款方式的總期數；沒有期數的還款方式為 null */
  periodsInMode: number | null;
  /** 這一期適用的年利率 % */
  rate: Dec;
  principal: Dec;
  interest: Dec;
  payment: Dec;
  /** 這一列之後的剩餘本金 */
  balance: Dec;
}

export interface Schedule {
  rows: ScheduleRow[];
  /** 計算到 until 為止的剩餘本金 */
  balance: Dec;
  /** 已經還清的日期；還沒還清為 null */
  paidOffAt: string | null;
}

/** 安全上限：50 年的月付 */
const MAX_PERIODS = 600;
/** 高精度定點數，用在本息平均攤還的 (1 + r)^n */
const HP = 10n ** 18n;
const RATE_DENOMINATOR = 1200n * ONE; // 年利率 % → 月利率：÷ 100 ÷ 12

// ---------- 日期 ----------

const dayMs = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs);
}

/** 加 n 個月，日期固定在 day 號；該月沒有這一天時取最後一天 */
function addMonths(date: string, months: number, day: number): string {
  const [y, m] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

/** 第 k 次扣款日（k 從 0 開始） */
function dueDate(loan: Loan, k: number): string {
  const day = Number(loan.firstPaymentDate.slice(8, 10));
  return addMonths(loan.firstPaymentDate, k, day);
}

// ---------- 利息與每期金額 ----------

/** 一整個月的利息（未四捨五入） */
function monthlyInterest(balance: Dec, ratePercent: Dec): Dec {
  return roundDiv(balance * ratePercent, RATE_DENOMINATOR);
}

/** 按日計息（未四捨五入） */
function dailyInterest(balance: Dec, ratePercent: Dec, days: number): Dec {
  return roundDiv(balance * ratePercent * BigInt(days), 36500n * ONE);
}

function powHP(base: bigint, exponent: number): bigint {
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

/** 本息平均攤還的每期金額（未四捨五入）：B × r × (1+r)^n ÷ ((1+r)^n − 1) */
export function annuityPayment(balance: Dec, ratePercent: Dec, periods: number): Dec {
  if (periods <= 0) return balance;
  if (ratePercent === ZERO) return roundDiv(balance, BigInt(periods));
  const r = roundDiv(ratePercent * HP, RATE_DENOMINATOR);
  const growth = powHP(HP + r, periods);
  return roundDiv(balance * r * growth, HP * (growth - HP));
}

// ---------- 查詢目前生效的設定 ----------

const byDate = <T>(list: T[], key: (item: T) => string) => [...list].sort((a, b) => key(a).localeCompare(key(b)));

function lastOnOrBefore<T>(sorted: T[], key: (item: T) => string, date: string): T | null {
  let found: T | null = null;
  for (const item of sorted) {
    if (key(item) <= date) found = item;
    else break;
  }
  return found;
}

/** 某一天適用的年利率 % */
export function rateOn(loan: Loan, date: string): Dec {
  const sorted = byDate(loan.rateChanges, (r) => r.effectiveDate);
  const found = lastOnOrBefore(sorted, (r) => r.effectiveDate, date) ?? sorted[0];
  return found ? dec(found.annualRate) : ZERO;
}

/** 某一天適用的還款方式 */
export function modeOn(loan: Loan, date: string): ModeChange | null {
  const sorted = byDate(loan.modeChanges, (m) => m.effectiveDate);
  return lastOnOrBefore(sorted, (m) => m.effectiveDate, date) ?? sorted[0] ?? null;
}

// ---------- 還款表 ----------

/**
 * 從起算日一路算到 until（含當天）。
 * 還清時提早結束；目前是緩繳或只繳息這類沒有終點的方式時，就算到 until 為止。
 */
export function buildSchedule(loan: Loan, until: string): Schedule {
  const digits = displayDigits(loan.currency);
  const money = (value: Dec) => round(value, digits);

  const modes = byDate(loan.modeChanges, (m) => m.effectiveDate);
  const rates = byDate(loan.rateChanges, (r) => r.effectiveDate);
  const adjustments = byDate(loan.adjustments, (a) => a.date);
  const rateAt = (date: string) => {
    const found = lastOnOrBefore(rates, (r) => r.effectiveDate, date) ?? rates[0];
    return found ? dec(found.annualRate) : ZERO;
  };

  const rows: ScheduleRow[] = [];
  let balance = dec(loan.principal);
  let paidOffAt: string | null = null;
  let nextAdjustment = 0;

  // 目前還款方式的狀態
  let modeIndex = -1;
  let periodInMode = 0;
  let fixedPayment: Dec | null = null; // 本息平均攤還的每期金額
  let fixedPrincipal: Dec | null = null; // 本金平均攤還的每期本金
  let recast = true;
  let lastRate: Dec | null = null;
  let unpaidInterest = ZERO; // 只繳息但還沒到繳息月份時累積的利息

  const applyAdjustment = (adj: LoanAdjustment) => {
    const before = balance;
    const amount = dec(adj.amount);
    if (adj.kind === 'prepayment') {
      const paid = amount > balance ? balance : amount;
      balance -= paid;
      if (adj.keep === 'term') recast = true;
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
      payment: adj.kind === 'prepayment' ? before - balance : ZERO,
      balance,
    });
    if (balance === ZERO) paidOffAt = adj.date;
  };

  const applyAdjustmentsBefore = (date: string, inclusive: boolean) => {
    while (nextAdjustment < adjustments.length && paidOffAt === null) {
      const adj = adjustments[nextAdjustment];
      if (adj.date <= loan.startDate) {
        nextAdjustment += 1; // 起算日當天或之前的調整已經反映在起算本金裡
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

    // 扣款日之前發生的調整先套用（當期利息仍以期初本金計算）
    const openingBalance = balance;
    applyAdjustmentsBefore(due, false);
    if (paidOffAt !== null) break;

    const current = lastOnOrBefore(modes, (m) => m.effectiveDate, due) ?? modes[0];
    if (!current) break;
    const currentIndex = modes.indexOf(current);
    let accrualFrom = periodStart;
    if (currentIndex !== modeIndex) {
      // 從緩繳本息切換過來：只從切換那天開始計息
      const previous = modes[modeIndex];
      if (previous?.mode === 'defer_all' && current.effectiveDate > periodStart) accrualFrom = current.effectiveDate;
      modeIndex = currentIndex;
      periodInMode = 0;
      fixedPayment = null;
      fixedPrincipal = null;
      recast = true;
    }

    const rate = rateAt(periodStart);
    if (current.mode === 'defer_all') {
      // 不繳錢、不計息
      periodStart = due;
      applyAdjustmentsBefore(due, true);
      continue;
    }

    // 緩繳本息剛好在扣款日當天結束：這一天還沒開始計息，不算一期
    if (daysBetween(accrualFrom, due) <= 0) {
      periodStart = due;
      applyAdjustmentsBefore(due, true);
      continue;
    }

    const fullMonth = addMonths(accrualFrom, 1, Number(due.slice(8, 10))) === due;
    const accrued = fullMonth
      ? monthlyInterest(openingBalance, rate)
      : dailyInterest(openingBalance, rate, daysBetween(accrualFrom, due));
    periodInMode += 1;
    const term = current.termMonths ?? 0;
    const remaining = Math.max(1, term - periodInMode + 1);

    let principal = ZERO;
    let interest = ZERO;
    let payNow = true;

    if (current.mode === 'interest_only') {
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
      if (current.mode === 'annuity') {
        if (recast || fixedPayment === null || (lastRate !== null && rate !== lastRate)) {
          fixedPayment = money(annuityPayment(balance, rate, remaining));
        }
        principal = fixedPayment - interest;
        if (principal < ZERO) principal = ZERO;
      } else if (current.mode === 'equal_principal') {
        if (recast || fixedPrincipal === null) fixedPrincipal = money(roundDiv(balance, BigInt(remaining)));
        principal = fixedPrincipal;
      }
      // 最後一期（或本金已經不夠一期）把剩下的一次還清
      if (remaining <= 1 || principal >= balance) principal = balance;
    }
    recast = false;
    lastRate = rate;

    if (payNow) {
      balance -= principal;
      rows.push({
        type: 'payment',
        date: due,
        mode: current.mode,
        period: periodInMode,
        periodsInMode: modeHasTerm(current.mode) ? term : null,
        rate,
        principal,
        interest,
        payment: principal + interest,
        balance,
      });
      if (balance === ZERO) paidOffAt = due;
    }

    periodStart = due;
    // 扣款日當天的調整在扣款之後套用
    applyAdjustmentsBefore(due, true);
  }

  // until 落在兩次扣款之間：之後的調整也要算進餘額
  if (paidOffAt === null) applyAdjustmentsBefore(until, true);

  return { rows, balance, paidOffAt };
}

/** 某一天結束時的剩餘本金 */
export function loanBalanceOn(loan: Loan, date: string): Dec {
  if (date < loan.startDate) return dec(loan.principal);
  return buildSchedule(loan, date).balance;
}

/** 下一次要繳的錢（date 之後的第一筆扣款）；已還清或一直緩繳時為 null */
export function nextPayment(loan: Loan, date: string, horizon: string): ScheduleRow | null {
  return buildSchedule(loan, horizon).rows.find((r) => r.type === 'payment' && r.date > date) ?? null;
}

// ---------- 資料庫資料 → 計算用的貸款 ----------

/** 和資料庫欄位同名；numeric 欄位以字串讀入 */
export interface LoanRow {
  id: string;
  item_id: string;
  start_date: string;
  principal: string;
  first_payment_date: string;
}
export interface LoanRateRow {
  id?: string;
  loan_id: string;
  effective_date: string;
  annual_rate: string;
}
export interface LoanModeRow {
  id?: string;
  loan_id: string;
  effective_date: string;
  mode: RepaymentMode;
  term_months: number | null;
  interest_every: number | null;
}
export interface LoanAdjustmentRow {
  id?: string;
  loan_id: string;
  adjust_date: string;
  kind: AdjustmentKind;
  amount: string;
  keep: 'term' | 'payment';
  note?: string | null;
}

/** 掛在某個項目底下的貸款 */
export interface LinkedLoan extends Loan {
  id: string;
  itemId: string;
}

/** 把四張表的資料組成計算用的貸款；幣別用所屬項目的幣別 */
export function loansFromRows(
  loans: LoanRow[],
  rates: LoanRateRow[],
  modes: LoanModeRow[],
  adjustments: LoanAdjustmentRow[],
  currencyOfItem: (itemId: string) => string | undefined,
): LinkedLoan[] {
  return loans.map((l) => ({
    id: l.id,
    itemId: l.item_id,
    currency: currencyOfItem(l.item_id) ?? 'TWD',
    startDate: l.start_date,
    principal: l.principal,
    firstPaymentDate: l.first_payment_date,
    rateChanges: rates
      .filter((r) => r.loan_id === l.id)
      .map((r) => ({ effectiveDate: r.effective_date, annualRate: r.annual_rate })),
    modeChanges: modes
      .filter((m) => m.loan_id === l.id)
      .map((m) => ({
        effectiveDate: m.effective_date,
        mode: m.mode,
        termMonths: m.term_months,
        interestEvery: m.interest_every,
      })),
    adjustments: adjustments
      .filter((a) => a.loan_id === l.id)
      .map((a) => ({ date: a.adjust_date, kind: a.kind, amount: a.amount, keep: a.keep })),
  }));
}

/**
 * 把貸款項目的金額換成還款表算出的某一天的餘額。
 * 首頁、每日快照、匯出都先經過這裡，所以貸款的金額永遠和還款表一致。
 */
export function withLoanBalances<T extends { id: string; amount: string }>(
  items: T[],
  loans: LinkedLoan[],
  date: string,
): T[] {
  const byItem = new Map(loans.map((l) => [l.itemId, l]));
  return items.map((item) => {
    const loan = byItem.get(item.id);
    return loan ? { ...item, amount: toFixedString(loanBalanceOn(loan, date), 4) } : item;
  });
}

// ---------- 表單檢查 ----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** 年利率 %：0 以上、100 以下，小數最多 4 位（資料庫 numeric(7,4)） */
export function parseRateInput(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const text = raw.replace(/[%\s]/g, '');
  if (text === '') return { ok: false, error: '請輸入年利率' };
  const match = /^(\d{1,2})(?:\.(\d*))?$/.exec(text);
  if (!match) return { ok: false, error: '年利率格式不正確（例如 1.775）' };
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  if (fraction.length > 4) return { ok: false, error: '年利率小數最多 4 位' };
  return { ok: true, value: fraction ? `${Number(match[1])}.${fraction}` : String(Number(match[1])) };
}

export interface ModeInput {
  effectiveDate: string;
  mode: RepaymentMode;
  termMonths: string;
  interestEvery: number;
}

export type ModeInputErrors = Partial<Record<keyof ModeInput, string>>;

/** 檢查還款方式；成功時回傳可以存進資料庫的值 */
export function validateModeInput(
  input: ModeInput,
): { ok: true; value: ModeChange } | { ok: false; errors: ModeInputErrors } {
  const errors: ModeInputErrors = {};
  if (!isIsoDate(input.effectiveDate)) errors.effectiveDate = '請選擇日期';
  if (!(REPAYMENT_MODES as readonly string[]).includes(input.mode)) errors.mode = '請選擇還款方式';
  let termMonths: number | null = null;
  if (modeHasTerm(input.mode)) {
    termMonths = Number(input.termMonths.trim());
    if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > MAX_PERIODS) {
      errors.termMonths = `期數請輸入 1 到 ${MAX_PERIODS} 的整數`;
    }
  }
  const interestEvery = input.mode === 'interest_only' ? input.interestEvery : null;
  if (interestEvery !== null && ![1, 3, 6, 12].includes(interestEvery)) errors.interestEvery = '請選擇繳息頻率';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { effectiveDate: input.effectiveDate, mode: input.mode, termMonths, interestEvery } };
}

export interface LoanInput extends Omit<ModeInput, 'effectiveDate'> {
  name: string;
  startDate: string;
  principal: string;
  firstPaymentDate: string;
  annualRate: string;
}

export type LoanInputErrors = Partial<Record<keyof LoanInput, string>>;

export interface ValidLoanInput {
  name: string;
  startDate: string;
  principal: string;
  firstPaymentDate: string;
  annualRate: string;
  mode: ModeChange;
}

/** 新增貸款的表單檢查 */
export function validateLoanInput(
  input: LoanInput,
): { ok: true; value: ValidLoanInput } | { ok: false; errors: LoanInputErrors } {
  const errors: LoanInputErrors = {};
  const name = input.name.trim();
  if (name.length === 0) errors.name = '請輸入名稱';
  else if (name.length > 60) errors.name = '名稱最多 60 字';
  if (!isIsoDate(input.startDate)) errors.startDate = '請選擇日期';
  if (!isIsoDate(input.firstPaymentDate)) errors.firstPaymentDate = '請選擇日期';
  else if (isIsoDate(input.startDate) && input.firstPaymentDate <= input.startDate) {
    errors.firstPaymentDate = '第一次扣款日要在起算日之後';
  }
  const principal = parseAmountInput(input.principal);
  if (!principal.ok) errors.principal = principal.error;
  else if (dec(principal.value) === ZERO) errors.principal = '本金要大於 0';
  const rate = parseRateInput(input.annualRate);
  if (!rate.ok) errors.annualRate = rate.error;
  const mode = validateModeInput({ ...input, effectiveDate: input.startDate });
  if (!mode.ok)
    Object.assign(errors, {
      mode: mode.errors.mode,
      termMonths: mode.errors.termMonths,
      interestEvery: mode.errors.interestEvery,
    });
  for (const key of Object.keys(errors) as (keyof LoanInputErrors)[]) if (!errors[key]) delete errors[key];
  if (Object.keys(errors).length > 0 || !principal.ok || !rate.ok || !mode.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      startDate: input.startDate,
      principal: principal.value,
      firstPaymentDate: input.firstPaymentDate,
      annualRate: rate.value,
      mode: mode.value,
    },
  };
}
