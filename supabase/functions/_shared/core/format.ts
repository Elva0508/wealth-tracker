import { type Dec, toFixedString } from './decimal.ts';

/** 加上千分位，例如 1234567.5 → "1,234,567.50"（digits = 2） */
export function formatNumber(value: Dec, digits: number): string {
  const text = toFixedString(value, digits);
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const [intPart, fracPart] = body.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const result = fracPart !== undefined ? `${grouped}.${fracPart}` : grouped;
  return negative ? `-${result}` : result;
}

/** 新台幣顯示到整數，外幣顯示到小數第 2 位（日圓、韓元等也顯示 2 位，之後可依幣別調整） */
export function displayDigits(currency: string, baseCurrency = 'TWD'): number {
  return currency === baseCurrency ? 0 : 2;
}

const CURRENCY_PREFIX: Record<string, string> = {
  TWD: 'NT$',
  USD: 'US$',
  JPY: '¥',
  EUR: '€',
  GBP: '£',
  HKD: 'HK$',
  CNY: 'CN¥',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
};

export function currencyPrefix(currency: string): string {
  return CURRENCY_PREFIX[currency] ?? currency;
}

/** 例如 formatMoney(dec('1000'), 'USD') → "US$ 1,000.00" */
export function formatMoney(value: Dec, currency: string, baseCurrency = 'TWD'): string {
  return `${currencyPrefix(currency)} ${formatNumber(value, displayDigits(currency, baseCurrency))}`;
}
