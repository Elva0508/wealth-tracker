/**
 * App 的共用資料：項目、匯率、設定，以及「隱藏金額」狀態。
 * 首頁和設定頁共用同一份，修改後呼叫 reload() 重新讀取。
 */
import { type FxRow, type RateTable, latestFetchedAt, rateTableFromRows } from '@core';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api';

/** 開啟 App 時，匯率超過這個時間就請後端更新一次 */
const REFRESH_RATES_AFTER_HOURS = 24;

interface AppData {
  items: api.Item[];
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
  const [items, setItems] = useState<api.Item[]>([]);
  const [rateRows, setRateRows] = useState<FxRow[]>([]);
  const [settings, setSettings] = useState<api.Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ratesRefreshing, setRatesRefreshing] = useState(false);
  const [hidden, setHidden] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [nextItems, nextRates] = await Promise.all([api.fetchItems(), api.fetchRates()]);
      setItems(nextItems);
      setRateRows(nextRates);
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
        const [nextItems, nextRates, nextSettings] = await Promise.all([
          api.fetchItems(),
          api.fetchRates(),
          api.fetchSettings(),
        ]);
        if (cancelled) return;
        setItems(nextItems);
        setRateRows(nextRates);
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

  const setHideByDefault = useCallback(async (hide: boolean) => {
    await api.updateHideAmounts(hide);
    setSettings((prev) => (prev ? { ...prev, hideAmounts: hide } : prev));
  }, []);

  const value: AppData = {
    items,
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
