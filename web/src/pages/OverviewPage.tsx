/**
 * 首頁：淨資產 → 總資產／總負債 → 平衡長條 → 資產大類與負債分類（點進去看該大類的項目）。
 * 所有數字由 @core 的 summarize() 計算。
 */
import {
  ASSET_GROUPS,
  CATEGORY_LABELS,
  type CategoryGroup,
  type Dec,
  GROUP_LABELS,
  LIABILITY_CATEGORIES,
  fxStatusFor,
  latestFetchedAt,
  summarize,
} from '@core';
import { type ReactNode, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Amount } from '../components/Amount';
import { BalanceColumns } from '../components/BalanceColumns';
import { CountUpAmount } from '../components/CountUpAmount';
import { ChevronRightIcon, EyeIcon, EyeOffIcon, PlusIcon } from '../components/Icons';
import { type CreateRequest, ItemCreateModal } from '../components/ItemCreateModal';
import { NetWorthTrend } from '../components/NetWorthTrend';
import { Page } from '../components/Page';
import { useAppData } from '../hooks/useAppData';
import { GROUP_COLORS, LIABILITY_COLORS, formatDateTime } from '../lib/constants';

export function OverviewPage() {
  const { items, rates, loading, error, hidden, setHidden, ratesRefreshing, snapshots } = useAppData();
  const navigate = useNavigate();
  const [creating, setCreating] = useState<CreateRequest | null>(null);

  const summary = useMemo(() => summarize(items, rates), [items, rates]);
  const fxStatus = fxStatusFor(
    summary.items.map((i) => i.currency),
    rates,
    new Date(),
  );
  const fetchedAt = latestFetchedAt(rates);
  const hasForeign = summary.items.some((i) => i.currency !== 'TWD');

  const openGroup = (group: CategoryGroup) => navigate(`/overview/${group}`);

  /** 一列：有項目時點進大類頁，還沒有項目時直接打開新增 */
  const row = (
    key: string,
    group: CategoryGroup,
    color: string,
    label: string,
    total: { count: number; total: Dec },
    onEmpty: () => void,
  ) => {
    const { count } = total;
    return (
      <button
        key={key}
        type="button"
        className="list-row list-row--button"
        onClick={count === 0 ? onEmpty : () => openGroup(group)}
      >
        <span className="swatch" style={{ background: color }} />
        <span className="list-row__main">
          <span>{label}</span>
          <span className="list-row__sub">{count === 0 ? '尚未新增' : `${count} 個項目`}</span>
        </span>
        {count === 0 ? (
          <span className="list-row__action">新增</span>
        ) : (
          <Amount value={total.total} className="list-row__value" />
        )}
        <span className="list-row__chevron">
          {count === 0 ? <PlusIcon size={16} /> : <ChevronRightIcon size={16} />}
        </span>
      </button>
    );
  };

  const section = (id: string, title: string, rows: ReactNode) => (
    <section className="list-group" aria-labelledby={id}>
      <h2 id={id} className="list-group__label">
        {title}
      </h2>
      <div className="list">{rows}</div>
    </section>
  );

  return (
    <Page
      title="資產總覽"
      largeTitle
      end={
        <button
          type="button"
          className="icon-button"
          aria-label={hidden ? '顯示金額' : '隱藏金額'}
          aria-pressed={!hidden}
          onClick={() => setHidden(!hidden)}
        >
          {hidden ? <EyeOffIcon size={22} /> : <EyeIcon size={22} />}
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
          <header className="hero">
            <span className="hero__label">淨資產 · {summary.baseCurrency}</span>
            <CountUpAmount
              value={summary.netWorth}
              className={`hero__value ${summary.netWorth < 0n ? 'hero__value--negative' : ''}`}
            />
            <FxNotice
              refreshing={ratesRefreshing}
              status={fxStatus}
              fetchedAt={fetchedAt}
              hasForeign={hasForeign}
              missing={summary.missingCurrencies}
            />
          </header>

          {summary.items.length > 0 && <NetWorthTrend snapshots={snapshots} liveNetWorth={summary.netWorth} />}

          {summary.items.length === 0 ? (
            <div className="empty">
              <p>還沒有任何資產或負債。</p>
              <p className="muted small">先新增銀行存款、股票市值或貸款餘額，這裡就會算出你的淨資產。</p>
              <button type="button" className="btn btn--primary" onClick={() => setCreating({})}>
                新增第一個項目
              </button>
            </div>
          ) : (
            <BalanceColumns summary={summary} onOpenGroup={openGroup} />
          )}

          {section(
            'overview-assets',
            '資產',
            ASSET_GROUPS.map((g) => {
              return row(g, g, GROUP_COLORS[g], GROUP_LABELS[g], summary.groups[g], () => setCreating({ group: g }));
            }),
          )}
          {/* 負債只有一個大類，這裡直接列出分類，顏色與平衡長條一致；點進去都是負債大類頁 */}
          {section(
            'overview-liabilities',
            '負債',
            LIABILITY_CATEGORIES.map((c) => {
              return row(c, 'liability', LIABILITY_COLORS[c], CATEGORY_LABELS[c], summary.categories[c], () =>
                setCreating({ category: c }),
              );
            }),
          )}
        </>
      )}

      <button type="button" className="fab" aria-label="新增項目" onClick={() => setCreating({})}>
        <PlusIcon size={24} />
      </button>

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
