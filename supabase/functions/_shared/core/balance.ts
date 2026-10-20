/**
 * 資產負債計算：總資產、總負債、淨資產、分類小計，以及首頁平衡長條的比例。
 * 這裡的函式都是純函式，不碰資料庫或網路，方便測試與審核。
 */
import { type Dec, ZERO, dec, mul, percentOf } from './decimal.ts';
import { BASE_CURRENCY, type RateTable, rateFor } from './fx.ts';

export const ASSET_CATEGORIES = ['cash_bank', 'securities', 'other_asset'] as const;
export const LIABILITY_CATEGORIES = ['loan', 'daily_liability'] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];
export type LiabilityCategory = (typeof LIABILITY_CATEGORIES)[number];
export type Category = AssetCategory | LiabilityCategory;
export type ItemKind = 'asset' | 'liability';
export type ItemStatus = 'active' | 'archived';

export const CATEGORY_LABELS: Record<Category, string> = {
  cash_bank: '現金與銀行存款',
  securities: '股票與 ETF',
  other_asset: '其他資產',
  loan: '貸款',
  daily_liability: '日常負債',
};

export function kindOf(category: Category): ItemKind {
  return (ASSET_CATEGORIES as readonly string[]).includes(category) ? 'asset' : 'liability';
}

export function isCategory(value: string): value is Category {
  return value in CATEGORY_LABELS;
}

/** 一個資產或負債項目。amount 一律是正數字串（負債也存正數）。 */
export interface BalanceItem {
  id: string;
  kind: ItemKind;
  category: Category;
  name: string;
  currency: string;
  amount: string;
  status: ItemStatus;
  notes?: string | null;
  sourceType?: string;
  sortOrder?: number;
}

/** 加上匯率換算結果的項目。找不到匯率時 rate 與 amountBase 為 null。 */
export interface ValuedItem extends BalanceItem {
  amountDec: Dec;
  rate: Dec | null;
  amountBase: Dec | null;
}

export interface CategoryTotal {
  category: Category;
  total: Dec;
  count: number;
}

export interface BalanceSummary {
  baseCurrency: string;
  totalAssets: Dec;
  totalLiabilities: Dec;
  netWorth: Dec;
  categories: Record<Category, CategoryTotal>;
  /** 只含啟用中的項目 */
  items: ValuedItem[];
  /** 找不到匯率的幣別。這些項目不計入總額，畫面要提示使用者 */
  missingCurrencies: string[];
}

/** 單一項目換算成基準幣別 */
export function valueItem(item: BalanceItem, rates: RateTable, baseCurrency = BASE_CURRENCY): ValuedItem {
  const amountDec = dec(item.amount);
  const rate = rateFor(rates, item.currency, baseCurrency);
  return { ...item, amountDec, rate, amountBase: rate === null ? null : mul(amountDec, rate) };
}

/** 計算首頁的所有總額。已封存的項目不計入。 */
export function summarize(items: BalanceItem[], rates: RateTable, baseCurrency = BASE_CURRENCY): BalanceSummary {
  const categories = Object.fromEntries(
    [...ASSET_CATEGORIES, ...LIABILITY_CATEGORIES].map((c) => [c, { category: c, total: ZERO, count: 0 }]),
  ) as Record<Category, CategoryTotal>;

  const valued: ValuedItem[] = [];
  const missing = new Set<string>();
  let totalAssets = ZERO;
  let totalLiabilities = ZERO;

  for (const item of items) {
    if (item.status !== 'active') continue;
    const v = valueItem(item, rates, baseCurrency);
    valued.push(v);
    categories[item.category].count += 1;
    if (v.amountBase === null) {
      missing.add(item.currency);
      continue;
    }
    categories[item.category].total += v.amountBase;
    if (kindOf(item.category) === 'asset') totalAssets += v.amountBase;
    else totalLiabilities += v.amountBase;
  }

  return {
    baseCurrency,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    categories,
    items: valued,
    missingCurrencies: [...missing].sort(),
  };
}

export type SegmentKind = 'asset' | 'liability' | 'net_worth' | 'shortfall';

export interface BarSegment {
  key: string;
  label: string;
  kind: SegmentKind;
  value: Dec;
  /** 占整條長度的百分比（0–100），只用於畫面 */
  percent: number;
}

export interface BalanceBars {
  /** 兩條長條共用的比例尺：資產與負債兩者中較大的那個 */
  scale: Dec;
  /** 上方長條：資產各分類；負債大於資產時，最後補一段虛線「缺口」 */
  assetRow: BarSegment[];
  /** 下方長條：負債各分類；資產大於負債時，最後補一段虛線「淨資產」 */
  liabilityRow: BarSegment[];
  /** 負債占資產的百分比；資產為 0 時為 null */
  liabilityRatio: number | null;
}

/**
 * 首頁「平衡長條」：資產 = 負債 + 淨資產。
 * 兩條長度相同，差額用虛線段補上，一眼看出負債吃掉多少資產。
 */
export function balanceBars(summary: BalanceSummary): BalanceBars {
  const { totalAssets, totalLiabilities, netWorth, categories } = summary;
  const scale = totalAssets > totalLiabilities ? totalAssets : totalLiabilities;

  const segment = (key: string, label: string, kind: SegmentKind, value: Dec): BarSegment => ({
    key,
    label,
    kind,
    value,
    percent: percentOf(value, scale),
  });

  const assetRow = ASSET_CATEGORIES.filter((c) => categories[c].total > ZERO).map((c) =>
    segment(c, CATEGORY_LABELS[c], 'asset', categories[c].total),
  );
  const liabilityRow = LIABILITY_CATEGORIES.filter((c) => categories[c].total > ZERO).map((c) =>
    segment(c, CATEGORY_LABELS[c], 'liability', categories[c].total),
  );

  if (netWorth > ZERO) liabilityRow.push(segment('net_worth', '淨資產', 'net_worth', netWorth));
  if (netWorth < ZERO) assetRow.push(segment('shortfall', '資不抵債', 'shortfall', -netWorth));

  return {
    scale,
    assetRow,
    liabilityRow,
    liabilityRatio: totalAssets > ZERO ? percentOf(totalLiabilities, totalAssets) : null,
  };
}
