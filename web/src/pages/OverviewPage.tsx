/**
 * 首頁：淨資產 → 大類手風琴（點項目進入編輯）→ 淨資產趨勢 → 資產與負債長條。
 * 新增一律從右上角的 + 開始；所有數字由 @core 的 summarize() 計算。
 */
import { type CategoryGroup, fxStatusFor, latestFetchedAt, summarize } from '@core';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { BalanceColumns } from '../components/BalanceColumns';
import { CountUpAmount } from '../components/CountUpAmount';
import { GroupAccordion } from '../components/GroupAccordion';
import { EyeIcon, EyeOffIcon, PlusIcon } from '../components/Icons';
import { type CreateRequest, ItemCreateModal } from '../components/ItemCreateModal';
import { NetWorthTrend } from '../components/NetWorthTrend';
import { Page } from '../components/Page';
import { useAppData } from '../hooks/useAppData';
import { formatDateTime } from '../lib/constants';

/** 展開中的大類只記在這台裝置，下次打開首頁維持原樣 */
const OPEN_KEY = 'overview-open-groups';

function loadOpen(): Set<CategoryGroup> {
  try {
    const saved = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]');
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

function saveOpen(open: Set<CategoryGroup>) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
  } catch {
    // 無痕模式等情況存不了，只是下次不會記得
  }
}

export function OverviewPage() {
  const { items, rates, loading, error, hidden, setHidden, ratesRefreshing, snapshots } = useAppData();
  const navigate = useNavigate();
  const [creating, setCreating] = useState<CreateRequest | null>(null);
  const [open, setOpen] = useState(loadOpen);

  const summary = useMemo(() => summarize(items, rates), [items, rates]);
  const fxStatus = fxStatusFor(
    summary.items.map((i) => i.currency),
    rates,
    new Date(),
  );
  const fetchedAt = latestFetchedAt(rates);
  const hasForeign = summary.items.some((i) => i.currency !== 'TWD');
  const ready = !loading && !error;

  const changeOpen = (update: (next: Set<CategoryGroup>) => void) =>
    setOpen((prev) => {
      const next = new Set(prev);
      update(next);
      saveOpen(next);
      return next;
    });

  const toggle = (group: CategoryGroup) =>
    changeOpen((next) => (next.has(group) ? next.delete(group) : next.add(group)));

  // 長條圖的「查看明細」：展開那個大類並捲過去
  const revealGroup = (group: CategoryGroup) => {
    changeOpen((next) => next.add(group));
    requestAnimationFrame(() =>
      document.getElementById(`acc-${group}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  return (
    <Page
      title="我的淨資產"
      largeTitle
      heading={
        <div className="net-head">
          <div className="net-head__label">
            <h1>我的淨資產</h1>
            <span className="net-head__currency">({summary.baseCurrency})</span>
            <button
              type="button"
              className="icon-button net-head__eye"
              aria-label={hidden ? '顯示金額' : '隱藏金額'}
              aria-pressed={!hidden}
              onClick={() => setHidden(!hidden)}
            >
              {hidden ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
            </button>
          </div>
          {ready ? (
            <CountUpAmount
              value={summary.netWorth}
              className={`hero__value ${summary.netWorth < 0n ? 'hero__value--negative' : ''}`}
            />
          ) : (
            <span className="hero__value">—</span>
          )}
        </div>
      }
      end={
        <button type="button" className="add-button" aria-label="新增項目" onClick={() => setCreating({})}>
          <PlusIcon size={24} />
        </button>
      }
    >
      {loading ? (
        <p className="page-message">載入中…</p>
      ) : error ? (
        <p className="page-message" role="alert">
          讀取資料失敗：{error}
        </p>
      ) : (
        <>
          <FxNotice
            refreshing={ratesRefreshing}
            status={fxStatus}
            fetchedAt={fetchedAt}
            hasForeign={hasForeign}
            missing={summary.missingCurrencies}
          />

          {summary.items.length === 0 ? (
            <div className="empty">
              <p>還沒有任何資產或負債。</p>
              <p className="muted small">按右上角的 + 新增銀行存款、股票市值或貸款餘額，這裡就會算出你的淨資產。</p>
            </div>
          ) : (
            <>
              <GroupAccordion
                items={summary.items}
                totals={summary.groups}
                open={open}
                onToggle={toggle}
                onOpenItem={(id) => navigate(`/overview/${id}`)}
              />
              <NetWorthTrend snapshots={snapshots} liveNetWorth={summary.netWorth} />
              <BalanceColumns summary={summary} onOpenGroup={revealGroup} />
            </>
          )}
        </>
      )}

      <ItemCreateModal request={creating} onClose={() => setCreating(null)} />
    </Page>
  );
}

function FxNotice({
  refreshing,
  status,
  fetchedAt,
  hasForeign,
  missing,
}: {
  refreshing: boolean;
  status: ReturnType<typeof fxStatusFor>;
  fetchedAt: string | null;
  hasForeign: boolean;
  missing: string[];
}) {
  if (refreshing) return <p className="hero__meta">正在更新匯率…</p>;
  if (!hasForeign) return null;
  const time = fetchedAt ? `匯率更新於 ${formatDateTime(fetchedAt)}` : '尚未取得匯率';
  return (
    <div className="hero__meta">
      <span>{time}</span>
      {status === 'stale' && <span className="badge badge--warn">非最新</span>}
      {status === 'fallback' && <span className="badge">部分使用備援匯率</span>}
      {missing.length > 0 && (
        <p className="warning" role="status">
          {missing.join('、')} 沒有匯率，相關項目暫不計入總額
        </p>
      )}
    </div>
  );
}
