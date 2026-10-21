import { type Category, type CategoryGroup, type LiabilityCategory, groupOf, isCategoryGroup } from '@core';

/** 臺灣銀行有牌告的幣別，加上新台幣。其他幣別由備援來源提供 */
export const CURRENCIES = [
  'TWD',
  'USD',
  'JPY',
  'EUR',
  'CNY',
  'HKD',
  'GBP',
  'AUD',
  'CAD',
  'SGD',
  'CHF',
  'NZD',
  'KRW',
  'THB',
  'SEK',
  'ZAR',
  'PHP',
  'IDR',
  'VND',
  'MYR',
] as const;

/**
 * 平衡長條與圖例的顏色：資產依大類、負債依分類各一色。
 * 同一欄的顏色除了色相也有明暗差，色弱也分得出來；每一段也都有文字標籤。
 */
export const GROUP_COLORS: Record<CategoryGroup, string> = {
  liquid: '#93b58a',
  investment: '#4a6b4e',
  fixed: '#c48a5a',
  receivable: '#6a8eab',
  liability: '#a2553a',
};

export const LIABILITY_COLORS: Record<LiabilityCategory, string> = {
  loan: '#a2553a',
  credit_card: '#e0a07a',
  payable: '#6f4f73',
  liability_other: '#8f8a5a',
};

/** 深色底，上面的文字要用白色 */
const DARK_COLORS = new Set(['#4a6b4e', '#a2553a', '#6f4f73', '#6a8eab', '#8f8a5a']);

/** 平衡長條的一段（大類或負債分類的代碼）→ 顏色 */
export function segmentColor(key: string): string | undefined {
  if (isCategoryGroup(key)) return GROUP_COLORS[key];
  if (key in LIABILITY_COLORS) return LIABILITY_COLORS[key as LiabilityCategory];
  return undefined;
}

export function isDarkColor(color: string | undefined): boolean {
  return color !== undefined && DARK_COLORS.has(color);
}

/** 一個分類在清單裡的色條：負債用自己的顏色，資產用所屬大類的顏色 */
export function categoryColor(category: Category): string {
  const group = groupOf(category);
  return group === 'liability' ? LIABILITY_COLORS[category as LiabilityCategory] : GROUP_COLORS[group];
}

export function formatDateTime(iso: string): string {
  const t = new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString();
  return `${Number(t.slice(5, 7))}/${Number(t.slice(8, 10))} ${t.slice(11, 16)}`;
}

/** 'YYYY-MM-DD' → '2026/10/15'；同一年可省略年份 → '10/15' */
export function formatDate(date: string, omitYearOf?: string): string {
  const [y, m, d] = date.split('-');
  const md = `${Number(m)}/${Number(d)}`;
  return omitYearOf && omitYearOf.slice(0, 4) === y ? md : `${y}/${md}`;
}
