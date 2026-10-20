/**
 * 首頁：淨資產 → 總資產／總負債 → 平衡長條 → 資產與負債分類（點進去看該分類的項目）。
 * 所有數字由 @core 的 summarize() 計算。
 */
import {
  ASSET_CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type ItemKind,
  LIABILITY_CATEGORIES,
  fxStatusFor,
  latestFetchedAt,
  summarize,
} from '@core';
import { IonButton, IonFab, IonFabButton, useIonRouter } from '@ionic/react';
import { useMemo, useState } from 'react';
import { Amount } from '../components/Amount';
import { BalanceColumns } from '../components/BalanceColumns';
import { CountUpAmount } from '../components/CountUpAmount';
import { ChevronRightIcon, EyeIcon, EyeOffIcon, PlusIcon } from '../components/Icons';
import { type CreateRequest, ItemCreateModal } from '../components/ItemCreateModal';
import { Page } from '../components/Page';
import { useAppData } from '../hooks/useAppData';
import { CATEGORY_COLORS, formatDateTime } from '../lib/constants';

export function OverviewPage() {
  const { items, rates, loading, error, hidden, setHidden, ratesRefreshing, reload } = useAppData();
  const router = useIonRouter();
  const [creating, setCreating] = useState<CreateRequest | null>(null);
  const [pageEl, setPageEl] = useState<HTMLDivElement | null>(null);

  const summary = useMemo(() => summarize(items, rates), [items, rates]);
  const fxStatus = fxStatusFor(
    summary.items.map((i) => i.currency),
    rates,
    new Date(),
  );
  const fetchedAt = latestFetchedAt(rates);
  const hasForeign = summary.items.some((i) => i.currency !== 'TWD');

  const openCategory = (category: Category) => router.push(`/overview/${category}`, 'forward');

  const section = (kind: ItemKind, categories: readonly Category[]) => (
    <section className="list-group" aria-labelledby={`group-${kind}`}>
      <h2 id={`group-${kind}`} className="list-group__label">
        {kind === 'asset' ? '資產' : '負債'}
      </h2>
      <div className="list">
        {categories.map((category) => {
          const count = summary.items.filter((i) => i.category === category).length;
          return (
            <button
              key={category}
              type="button"
              className="list-row list-row--button"
              onClick={() => (count === 0 ? setCreating({ kind, category }) : openCategory(category))}
            >
              <span className="swatch" style={{ background: CATEGORY_COLORS[category] }} />
              <span className="list-row__main">
                <span>{CATEGORY_LABELS[category]}</span>
                <span className="list-row__sub">{count === 0 ? '尚未新增' : `${count} 個項目`}</span>
              </span>
              {count === 0 ? (
                <span className="list-row__action">新增</span>
              ) : (
                <Amount value={summary.categories[category].total} className="list-row__value" />
              )}
              <span className="list-row__chevron">
                {count === 0 ? <PlusIcon size={16} /> : <ChevronRightIcon size={16} />}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );

  return (
    <Page
      ref={setPageEl}
      title="資產總覽"
      largeTitle
      onRefresh={reload}
      fixed={
        <IonFab slot="fixed" vertical="bottom" horizontal="end" className="fab">
          <IonFabButton aria-label="新增項目" onClick={() => setCreating({ kind: 'asset' })}>
            <PlusIcon size={24} />
          </IonFabButton>
        </IonFab>
      }
      end={
        <IonButton
          fill="clear"
          aria-label={hidden ? '顯示金額' : '隱藏金額'}
          aria-pressed={!hidden}
          onClick={() => setHidden(!hidden)}
        >
          {hidden ? <EyeOffIcon size={22} /> : <EyeIcon size={22} />}
        </IonButton>
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

          {summary.items.length === 0 ? (
            <div className="empty">
              <p>還沒有任何資產或負債。</p>
              <p className="muted small">先新增銀行存款、股票市值或貸款餘額，這裡就會算出你的淨資產。</p>
              <button type="button" className="btn btn--primary" onClick={() => setCreating({ kind: 'asset' })}>
                新增第一個項目
              </button>
            </div>
          ) : (
            <BalanceColumns summary={summary} onOpenCategory={openCategory} />
          )}

          {section('asset', ASSET_CATEGORIES)}
          {section('liability', LIABILITY_CATEGORIES)}
        </>
      )}

      <ItemCreateModal request={creating} presentingElement={pageEl} onClose={() => setCreating(null)} />
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
