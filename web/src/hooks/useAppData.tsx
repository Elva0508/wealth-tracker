/**
 * App 的共用資料：項目、貸款、匯率、設定，以及「隱藏金額」狀態。
 * 各頁共用同一份，修改後呼叫 reload() 重新讀取。
 *
 * 貸款項目的金額一律換成還款表算出的今天餘額（和每日快照同一套算法），
 * 所以首頁、分類頁、匯出看到的都和還款表一致。
 */
import {
  type FxRow,
  type LinkedLoan,
  type RateTable,
  latestFetchedAt,
  loansFromRows,
  rateTableFromRows,
  taipeiDate,
  withLoanBalances,
} from '@core';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api';

/** 開啟 App 時，匯率超過這個時間就請後端更新一次 */
const REFRESH_RATES_AFTER_HOURS = 24;

/** 畫面用的貸款：計算用的資料＋所屬項目＋各筆紀錄的 id（刪除用） */
export interface LoanView extends LinkedLoan {
  item: api.Item;
  records: Pick<api.LoanData, 'rates' | 'modes' | 'adjustments'>;
}

const EMPTY_LOANS: api.LoanData = { loans: [], rates: [], modes: [], adjustments: [] };

interface AppData {
  /** 貸款項目的金額已換成今天的餘額 */
  items: api.Item[];
  loans: LoanView[];
  /** 今天（台灣時間），貸款餘額算到這一天 */
  today: string;
  rates: RateTable;
  settings: api.Settings | null;
  loading: boolean;
  error: string | null;
  ratesRefreshing: boolean;
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  /** 設定頁：開啟 App 時是否預設隱藏金額 */
  setHideByDefault: (hide: boolean) => Promise<void>;
  reload: () => Promise<void>;
}

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [rawItems, setItems] = useState<api.Item[]>([]);
  const [loanData, setLoanData] = useState<api.LoanData>(EMPTY_LOANS);
  const [rateRows, setRateRows] = useState<FxRow[]>([]);
  const [settings, setSettings] = useState<api.Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ratesRefreshing, setRatesRefreshing] = useState(false);
  const [hidden, setHidden] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [nextItems, nextRates, nextLoans] = await Promise.all([
        api.fetchItems(),
        api.fetchRates(),
        api.fetchLoans(),
      ]);
      setItems(nextItems);
      setRateRows(nextRates);
      setLoanData(nextLoans);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // 第一次載入：讀資料與設定；匯率太舊時在背景請後端更新
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [nextItems, nextRates, nextSettings, nextLoans] = await Promise.all([
          api.fetchItems(),
          api.fetchRates(),
          api.fetchSettings(),
          api.fetchLoans(),
        ]);
        if (cancelled) return;
        setItems(nextItems);
        setRateRows(nextRates);
        setLoanData(nextLoans);
        setSettings(nextSettings);
        setHidden(nextSettings.hideAmounts);

        const latest = latestFetchedAt(rateTableFromRows(nextRates));
        const ageHours = latest ? (Date.now() - new Date(latest).getTime()) / 3_600_000 : Infinity;
        if (ageHours > REFRESH_RATES_AFTER_HOURS) {
          setRatesRefreshing(true);
          try {
            await api.requestFxRefresh();
            const refreshed = await api.fetchRates();
            if (!cancelled) setRateRows(refreshed);
          } catch (e) {
            // 更新失敗不影響使用：沿用最近一次匯率，畫面會標示「非最新」
            console.warn('匯率更新失敗', e);
          } finally {
            if (!cancelled) setRatesRefreshing(false);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rates = useMemo(() => rateTableFromRows(rateRows), [rateRows]);

  const today = taipeiDate(new Date());
  const loans = useMemo<LoanView[]>(() => {
    const itemsById = new Map(rawItems.map((i) => [i.id, i]));
    const linked = loansFromRows(
      loanData.loans,
      loanData.rates,
      loanData.modes,
      loanData.adjustments,
      (id) => itemsById.get(id)?.currency,
    );
    return linked.flatMap((loan) => {
      const item = itemsById.get(loan.itemId);
      if (!item) return [];
      const mine = <T extends { loan_id: string }>(list: T[]) => list.filter((r) => r.loan_id === loan.id);
      return [
        {
          ...loan,
          item,
          records: {
            rates: mine(loanData.rates),
            modes: mine(loanData.modes),
            adjustments: mine(loanData.adjustments),
          },
        },
      ];
    });
  }, [rawItems, loanData]);
  const items = useMemo(() => withLoanBalances(rawItems, loans, today), [rawItems, loans, today]);

  // 貸款餘額和資料庫的金額不同（例如又過了一個扣款日）時寫回資料庫
  useEffect(() => {
    const stale = items.filter((item, i) => item.amount !== rawItems[i]?.amount && item.status === 'active');
    if (stale.length === 0) return;
    let cancelled = false;
    Promise.all(stale.map((item) => api.syncItemAmount(item.id, item.amount)))
      .then(() => {
        if (cancelled) return;
        const synced = new Map(stale.map((item) => [item.id, item.amount]));
        setItems((prev) =>
          prev.map((item) => (synced.has(item.id) ? { ...item, amount: synced.get(item.id)! } : item)),
        );
      })
      .catch((e) => console.warn('貸款餘額同步失敗', e));
    return () => {
      cancelled = true;
    };
  }, [items, rawItems]);

  const setHideByDefault = useCallback(async (hide: boolean) => {
    await api.updateHideAmounts(hide);
    setSettings((prev) => (prev ? { ...prev, hideAmounts: hide } : prev));
  }, []);

  const value: AppData = {
    items,
    loans,
    today,
    rates,
    settings,
    loading,
    error,
    ratesRefreshing,
    hidden,
    setHidden,
    setHideByDefault,
    reload,
  };
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppData {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData 必須在 AppDataProvider 內使用');
  return value;
}
