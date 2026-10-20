import type { BalanceItem, Category, FxRow, RateTable } from '../index.ts';
import { kindOf, rateTableFromRows } from '../index.ts';

let counter = 0;

/** 測試用的項目。id 自動產生成合法的 uuid 格式 */
export function item(category: Category, amount: string, extra: Partial<BalanceItem> = {}): BalanceItem {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    kind: kindOf(category),
    category,
    name: `項目 ${counter}`,
    currency: 'TWD',
    amount,
    status: 'active',
    ...extra,
  };
}

/** 測試用的匯率表，例如 rates({ USD: '32' }) */
export function rates(
  values: Record<string, string>,
  options: { source?: FxRow['source']; fetchedAt?: string } = {},
): RateTable {
  return rateTableFromRows(
    Object.entries(values).map(([currency, mid]) => ({
      currency,
      mid_rate: mid,
      source: options.source ?? 'bot',
      rate_date: '2026-10-19',
      fetched_at: options.fetchedAt ?? '2026-10-19T08:00:00Z',
    })),
  );
}
