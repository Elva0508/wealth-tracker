import type { Category } from '@core';

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

/** 平衡長條與圖例的顏色；同一畫面的顏色除了色相也要有明暗差，色弱也分得出來 */
export const CATEGORY_COLORS: Record<Category, string> = {
  cash_bank: 'var(--sage-300)',
  securities: 'var(--sage-600)',
  other_asset: 'var(--sage-450)',
  loan: 'var(--clay-600)',
  daily_liability: 'var(--clay-300)',
};

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
