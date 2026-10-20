/**
 * 每日快照：把「當下」的資產狀況整理成一筆要寫入資料庫的資料。
 * 快照寫入後就不再改寫；之後修改項目只影響之後的快照。
 */
import { toFixedString } from './decimal.ts';
import { snapshotDateFor } from './dates.ts';
import { BASE_CURRENCY, type FxStatus, type RateTable, fxStatusFor } from './fx.ts';
import { type BalanceItem, type Category, summarize } from './balance.ts';

export interface SnapshotLine {
  itemId: string;
  category: Category;
  currency: string;
  amount: string;
  fxRate: string | null;
  amountBase: string | null;
}

export interface SnapshotPayload {
  snapshotDate: string;
  totalAssets: string;
  totalLiabilities: string;
  netWorth: string;
  fxStatus: FxStatus;
  lines: SnapshotLine[];
}

export function buildSnapshot(
  items: BalanceItem[],
  rates: RateTable,
  runAt: Date,
  baseCurrency = BASE_CURRENCY,
): SnapshotPayload {
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
      baseCurrency,
    ),
    lines: summary.items.map((item) => ({
      itemId: item.id,
      category: item.category,
      currency: item.currency,
      amount: toFixedString(item.amountDec, 4),
      fxRate: item.rate === null ? null : toFixedString(item.rate),
      amountBase: item.amountBase === null ? null : toFixedString(item.amountBase, 4),
    })),
  };
}
