/**
 * 表單輸入檢查。前端送出前用，資料庫也有對應的 check constraint 再擋一次。
 */
import { type Category, CATEGORY_LABELS, CATEGORY_SUBTYPES, subtypeLabel } from './balance.ts';

export type AmountParseResult = { ok: true; value: string } | { ok: false; error: string };

/** 資料庫欄位 numeric(20,4)：整數最多 16 位、小數最多 4 位 */
const MAX_INTEGER_DIGITS = 16;
const MAX_FRACTION_DIGITS = 4;

/**
 * 解析使用者輸入的金額。接受千分位逗號與前後空白；
 * 負數一律拒絕（負債也輸入正數，系統自動視為負債）。
 */
export function parseAmountInput(raw: string): AmountParseResult {
  const text = raw.replace(/[,\s]/g, '');
  if (text === '') return { ok: false, error: '請輸入金額' };
  if (text.startsWith('-')) return { ok: false, error: '請輸入正數，負債也輸入正數' };
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text);
  if (!match) return { ok: false, error: '金額格式不正確' };
  const intPart = match[1].replace(/^0+(?=\d)/, '');
  const fracPart = (match[2] ?? '').replace(/0+$/, '');
  if (intPart.length > MAX_INTEGER_DIGITS) return { ok: false, error: '金額太大' };
  if (fracPart.length > MAX_FRACTION_DIGITS) return { ok: false, error: `小數最多 ${MAX_FRACTION_DIGITS} 位` };
  return { ok: true, value: fracPart ? `${intPart}.${fracPart}` : intPart };
}

export function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

const DEFAULT_NAME_PREFIX: Record<Category, string> = {
  cash: '現金',
  ewallet: '電子錢包',
  bank: '銀行帳戶',
  liquid_other: '其他資金',
  fund: '基金',
  stock: '證券帳戶',
  crypto: '加密貨幣',
  metal: '貴金屬',
  investment_other: '其他投資',
  real_estate: '房地產',
  fixed_other: '固定資產',
  lending: '借出款項',
  receivable_other: '應收款',
  credit_card: '信用卡',
  loan: '貸款',
  payable: '應付款',
  liability_other: '其他負債',
};

/** 名稱留空時的預設名稱，例如「銀行帳戶 1」「街口支付 1」；已被使用的編號會跳過 */
export function defaultItemName(category: Category, existingNames: Iterable<string>, subtype?: string | null): string {
  const prefix = subtypeLabel(category, subtype) ?? DEFAULT_NAME_PREFIX[category];
  const used = new Set(existingNames);
  for (let n = 1; ; n++) {
    const candidate = `${prefix} ${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

export const NAME_MAX_LENGTH = 60;
export const NOTES_MAX_LENGTH = 500;

export interface ItemInput {
  category: Category;
  /** 第三層細項；這個分類沒有細項時留空 */
  subtype?: string | null;
  name: string;
  currency: string;
  amount: string;
  notes: string;
}

export type ItemInputErrors = Partial<Record<keyof ItemInput, string>>;

export interface ValidItemInput {
  category: Category;
  subtype: string | null;
  name: string;
  currency: string;
  amount: string;
  notes: string | null;
}

/** 檢查整份表單；成功時回傳整理好的值（名稱已補預設值、金額已正規化） */
export function validateItemInput(
  input: ItemInput,
  existingNames: Iterable<string>,
): { ok: true; value: ValidItemInput } | { ok: false; errors: ItemInputErrors } {
  const errors: ItemInputErrors = {};
  if (!(input.category in CATEGORY_LABELS)) errors.category = '請選擇分類';
  const subtype = input.subtype || null;
  if (subtype && !CATEGORY_SUBTYPES[input.category]?.some((s) => s.key === subtype)) errors.category = '請選擇細項';

  const name = input.name.trim();
  if (name.length > NAME_MAX_LENGTH) errors.name = `名稱最多 ${NAME_MAX_LENGTH} 字`;

  const currency = input.currency.trim().toUpperCase();
  if (!isCurrencyCode(currency)) errors.currency = '幣別格式不正確';

  const amount = parseAmountInput(input.amount);
  if (!amount.ok) errors.amount = amount.error;

  const notes = input.notes.trim();
  if (notes.length > NOTES_MAX_LENGTH) errors.notes = `備註最多 ${NOTES_MAX_LENGTH} 字`;

  if (Object.keys(errors).length > 0 || !amount.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      category: input.category,
      subtype,
      name: name || defaultItemName(input.category, existingNames, subtype),
      currency,
      amount: amount.value,
      notes: notes || null,
    },
  };
}
