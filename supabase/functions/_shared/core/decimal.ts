/**
 * 定點小數運算。
 *
 * 所有金額與匯率在計算時都轉成 bigint，固定保留 6 位小數，
 * 避免 JavaScript 浮點數誤差（例如 0.1 + 0.2 = 0.30000000000000004）。
 *
 * - 資料庫的 numeric 欄位以「字串」讀進來，再用 dec() 轉換
 * - 計算完用 toFixedString() 轉回字串寫入資料庫
 * - 四捨五入規則：0.5 一律遠離 0 進位（與 PostgreSQL round() 相同）
 */

export const SCALE = 6;
const FACTOR = 10n ** BigInt(SCALE);

/** 定點小數，內部值 = 實際值 × 10^6 */
export type Dec = bigint;

export const ZERO: Dec = 0n;
export const ONE: Dec = FACTOR;

const DECIMAL_RE = /^([+-])?(\d+)(?:\.(\d+))?$/;

/** 整數除法並四捨五入（0.5 遠離 0） */
function roundDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('除數不能為 0');
  const negative = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n * 2n + d) / (d * 2n);
  return negative ? -q : q;
}

/**
 * 把字串或數字轉成 Dec。
 * 字串必須是一般小數格式（"1234.5"、"-0.25"），不接受千分位逗號或科學記號。
 * 數字只用在外部 API 回傳的浮點匯率，會先轉成 12 位小數字串再解析。
 */
export function dec(value: string | number | bigint): Dec {
  if (typeof value === 'bigint') return value * FACTOR;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`不是有效的數字：${value}`);
    return dec(value.toFixed(12));
  }
  const match = DECIMAL_RE.exec(value.trim());
  if (!match) throw new RangeError(`不是有效的小數：「${value}」`);
  const [, sign, intPart, fracPart = ''] = match;
  // 多保留一位，用來四捨五入到 SCALE 位
  const digits = fracPart.padEnd(SCALE + 1, '0');
  const kept = BigInt(intPart + digits.slice(0, SCALE));
  const rest = digits.slice(SCALE);
  let result = kept;
  if (rest.length > 0 && rest[0] >= '5') result += 1n;
  return sign === '-' ? -result : result;
}

/** 字串是否為合法的小數格式 */
export function isDecimalString(value: string): boolean {
  return DECIMAL_RE.test(value.trim());
}

export const add = (a: Dec, b: Dec): Dec => a + b;
export const sub = (a: Dec, b: Dec): Dec => a - b;
export const neg = (a: Dec): Dec => -a;
export const abs = (a: Dec): Dec => (a < 0n ? -a : a);
export const isZero = (a: Dec): boolean => a === 0n;
export const cmp = (a: Dec, b: Dec): -1 | 0 | 1 => (a < b ? -1 : a > b ? 1 : 0);

export function mul(a: Dec, b: Dec): Dec {
  return roundDiv(a * b, FACTOR);
}

export function div(a: Dec, b: Dec): Dec {
  return roundDiv(a * FACTOR, b);
}

export function sum(values: Iterable<Dec>): Dec {
  let total = ZERO;
  for (const v of values) total += v;
  return total;
}

/** 四捨五入到指定小數位數（仍回傳 Dec） */
export function round(a: Dec, digits: number): Dec {
  if (digits < 0 || digits > SCALE) throw new RangeError(`小數位數必須介於 0 到 ${SCALE}`);
  const step = 10n ** BigInt(SCALE - digits);
  return roundDiv(a, step) * step;
}

/** 轉成固定小數位數的字串，例如 toFixedString(dec('1.005'), 2) === '1.01' */
export function toFixedString(a: Dec, digits: number = SCALE): string {
  const rounded = round(a, digits);
  const negative = rounded < 0n;
  const absValue = negative ? -rounded : rounded;
  const intPart = absValue / FACTOR;
  const fracAll = (absValue % FACTOR).toString().padStart(SCALE, '0');
  const frac = fracAll.slice(0, digits);
  const body = digits > 0 ? `${intPart}.${frac}` : `${intPart}`;
  return negative ? `-${body}` : body;
}

/** 金額占比，回傳 0–100 的一般數字（只用於畫面顯示，不再參與計算） */
export function percentOf(part: Dec, whole: Dec): number {
  if (whole === 0n) return 0;
  // 先算到 0.01%，再轉成 number
  return Number(roundDiv(part * 10000n, whole)) / 100;
}
