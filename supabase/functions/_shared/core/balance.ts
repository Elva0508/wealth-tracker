/**
 * 資產負債計算：總資產、總負債、淨資產、分類小計，以及首頁平衡長條的比例。
 * 這裡的函式都是純函式，不碰資料庫或網路，方便測試與審核。
 */
import { type Dec, ZERO, dec, mul, percentOf } from './decimal.ts';
import { BASE_CURRENCY, type RateTable, rateFor } from './fx.ts';

/**
 * 分類有三層：大類（流動資金、投資…）→ 分類（存在資料庫的 category）→ 細項（subtype，可留空）。
 * 大類決定是資產還是負債；首頁依大類顯示，平衡長條的資產依大類、負債依分類分段。
 */
export const CATEGORY_GROUPS = ['liquid', 'investment', 'fixed', 'receivable', 'liability'] as const;
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number];
export const ASSET_GROUPS = ['liquid', 'investment', 'fixed', 'receivable'] as const;

export const GROUP_LABELS: Record<CategoryGroup, string> = {
  liquid: '流動資金',
  investment: '投資',
  fixed: '固定資產',
  receivable: '應收款',
  liability: '負債',
};

export const GROUP_CATEGORIES = {
  liquid: ['cash', 'ewallet', 'bank', 'liquid_other'],
  investment: ['fund', 'stock', 'crypto', 'metal', 'investment_other'],
  fixed: ['real_estate', 'fixed_other'],
  receivable: ['lending', 'receivable_other'],
  liability: ['credit_card', 'loan', 'payable', 'liability_other'],
} as const satisfies Record<CategoryGroup, readonly string[]>;

export type LiabilityCategory = (typeof GROUP_CATEGORIES)['liability'][number];
export type AssetCategory = (typeof GROUP_CATEGORIES)[(typeof ASSET_GROUPS)[number]][number];
export type Category = AssetCategory | LiabilityCategory;
export type ItemKind = 'asset' | 'liability';
export type ItemStatus = 'active' | 'archived';

export const ASSET_CATEGORIES: readonly AssetCategory[] = ASSET_GROUPS.flatMap((g) => GROUP_CATEGORIES[g]);
export const LIABILITY_CATEGORIES: readonly LiabilityCategory[] = GROUP_CATEGORIES.liability;
export const CATEGORIES: readonly Category[] = [...ASSET_CATEGORIES, ...LIABILITY_CATEGORIES];

export const CATEGORY_LABELS: Record<Category, string> = {
  cash: '現金',
  ewallet: '電子錢包',
  bank: '銀行帳戶',
  liquid_other: '其他',
  fund: '投資基金',
  stock: '股票',
  crypto: '加密貨幣',
  metal: '貴金屬',
  investment_other: '其他投資',
  real_estate: '房地產',
  fixed_other: '其他固定資產',
  lending: '借出款項',
  receivable_other: '其他應收款',
  credit_card: '信用卡',
  loan: '貸款',
  payable: '應付款',
  liability_other: '其他負債',
};

export interface Subtype {
  key: string;
  label: string;
}

/** 第三層細項。存在資料庫的 subtype 欄位；之後要增減選項只要改這裡 */
export const CATEGORY_SUBTYPES: Partial<Record<Category, readonly Subtype[]>> = {
  ewallet: [
    { key: 'jkopay', label: '街口支付' },
    { key: 'linepay', label: 'LINE Pay Money' },
    { key: 'easywallet', label: '悠遊付' },
    { key: 'pxpay', label: '全支付' },
    { key: 'icashpay', label: 'icash Pay' },
    { key: 'ipass', label: '一卡通 iPASS MONEY' },
    { key: 'taiwanpay', label: '台灣 Pay' },
    { key: 'other', label: '其他電子錢包' },
  ],
  stock: [
    { key: 'tw', label: '台股' },
    { key: 'us', label: '美股' },
    { key: 'hk', label: '港股' },
    { key: 'jp', label: '日股' },
    { key: 'other', label: '其他市場' },
  ],
  investment_other: [
    { key: 'insurance', label: '儲蓄型保險' },
    { key: 'bond', label: '債券' },
    { key: 'p2p', label: 'P2P 借貸' },
    { key: 'other', label: '其他' },
  ],
  loan: [
    { key: 'mortgage', label: '房屋貸款' },
    { key: 'car', label: '汽車貸款' },
    { key: 'personal', label: '信用貸款' },
    { key: 'student', label: '學貸' },
    { key: 'other', label: '其他貸款' },
  ],
};

/** 舊版（V1b 以前）的分類代碼 → 新分類。資料庫已經轉換過；舊備份還原時用這張表 */
export const LEGACY_CATEGORIES: Record<string, Category> = {
  cash_bank: 'bank',
  securities: 'stock',
  other_asset: 'investment_other',
  daily_liability: 'liability_other',
};

export function isCategory(value: string): value is Category {
  return value in CATEGORY_LABELS;
}

export function isCategoryGroup(value: string): value is CategoryGroup {
  return value in GROUP_LABELS;
}

export function groupOf(category: Category): CategoryGroup {
  return CATEGORY_GROUPS.find((g) => (GROUP_CATEGORIES[g] as readonly string[]).includes(category))!;
}

export function kindOf(category: Category): ItemKind {
  return groupOf(category) === 'liability' ? 'liability' : 'asset';
}

export function subtypeLabel(category: Category, subtype: string | null | undefined): string | null {
  if (!subtype) return null;
  return CATEGORY_SUBTYPES[category]?.find((s) => s.key === subtype)?.label ?? null;
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
  /** 第三層細項，例如電子錢包的「街口支付」；沒有細項時為 null */
  subtype?: string | null;
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

export interface GroupTotal {
  group: CategoryGroup;
  total: Dec;
  count: number;
}

export interface BalanceSummary {
  baseCurrency: string;
  totalAssets: Dec;
  totalLiabilities: Dec;
  netWorth: Dec;
  categories: Record<Category, CategoryTotal>;
  groups: Record<CategoryGroup, GroupTotal>;
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
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c, { category: c, total: ZERO, count: 0 }])) as Record<
    Category,
    CategoryTotal
  >;
  const groups = Object.fromEntries(CATEGORY_GROUPS.map((g) => [g, { group: g, total: ZERO, count: 0 }])) as Record<
    CategoryGroup,
    GroupTotal
  >;

  const valued: ValuedItem[] = [];
  const missing = new Set<string>();
  let totalAssets = ZERO;
  let totalLiabilities = ZERO;

  for (const item of items) {
    if (item.status !== 'active') continue;
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
    if (kindOf(item.category) === 'asset') totalAssets += v.amountBase;
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
  /** 資產長條：資產各大類（key 是大類）；負債大於資產時，最後補一段虛線「缺口」 */
  assetRow: BarSegment[];
  /** 負債長條：負債各分類（key 是分類）；資產大於負債時，最後補一段虛線「淨資產」 */
  liabilityRow: BarSegment[];
  /** 負債占資產的百分比；資產為 0 時為 null */
  liabilityRatio: number | null;
}

/**
 * 首頁「平衡長條」：資產 = 負債 + 淨資產。
 * 兩條長度相同，差額用虛線段補上，一眼看出負債吃掉多少資產。
 */
export function balanceBars(summary: BalanceSummary): BalanceBars {
  const { totalAssets, totalLiabilities, netWorth, categories, groups } = summary;
  const scale = totalAssets > totalLiabilities ? totalAssets : totalLiabilities;

  const segment = (key: string, label: string, kind: SegmentKind, value: Dec): BarSegment => ({
    key,
    label,
    kind,
    value,
    percent: percentOf(value, scale),
  });

  const assetRow = ASSET_GROUPS.filter((g) => groups[g].total > ZERO).map((g) =>
    segment(g, GROUP_LABELS[g], 'asset', groups[g].total),
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
