/** 第二層：一個分類底下的所有項目，點項目再往下一層編輯 */
import { CATEGORY_LABELS, type ValuedItem, isCategory, kindOf, summarize } from '@core';
import { IonButton, useIonRouter } from '@ionic/react';
import { useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Amount } from '../components/Amount';
import { ChevronRightIcon, PlusIcon } from '../components/Icons';
import { type CreateRequest, ItemCreateModal } from '../components/ItemCreateModal';
import { Page } from '../components/Page';
import { useAppData } from '../hooks/useAppData';
import { CATEGORY_COLORS } from '../lib/constants';

export function CategoryPage() {
  const { category } = useParams();
  const { items, rates, reload } = useAppData();
  const router = useIonRouter();
  const [creating, setCreating] = useState<CreateRequest | null>(null);
  const [pageEl, setPageEl] = useState<HTMLDivElement | null>(null);
  const summary = useMemo(() => summarize(items, rates), [items, rates]);

  if (!category || !isCategory(category)) return <Navigate to="/overview" replace />;

  const kind = kindOf(category);
  const list = summary.items.filter((i) => i.category === category);
  const total = summary.categories[category].total;

  return (
    <Page
      ref={setPageEl}
      title={CATEGORY_LABELS[category]}
      backHref="/overview"
      backText="總覽"
      onRefresh={reload}
      end={
        <IonButton aria-label="新增項目" onClick={() => setCreating({ kind, category })}>
          <PlusIcon size={22} />
        </IonButton>
      }
    >
      <header className="sub-hero">
        <span className="sub-hero__label">
          <span className="swatch" style={{ background: CATEGORY_COLORS[category] }} />
          {kind === 'asset' ? '資產' : '負債'} · {list.length} 個項目
        </span>
        <Amount value={total} className="sub-hero__value" />
      </header>

      {list.length === 0 ? (
        <div className="empty">
          <p>這個分類還沒有項目。</p>
          <button type="button" className="btn btn--primary" onClick={() => setCreating({ kind, category })}>
            新增項目
          </button>
        </div>
      ) : (
        <div className="list-group">
          <ul className="list">
            {list.map((v) => (
              <ItemRow key={v.id} item={v} onOpen={() => router.push(`/overview/${category}/${v.id}`, 'forward')} />
            ))}
          </ul>
        </div>
      )}

      <ItemCreateModal request={creating} presentingElement={pageEl} onClose={() => setCreating(null)} />
    </Page>
  );
}

function ItemRow({ item, onOpen }: { item: ValuedItem; onOpen: () => void }) {
  const foreign = item.currency !== 'TWD';
  return (
    <li>
      <button type="button" className="list-row list-row--button" onClick={onOpen}>
        <span className="list-row__main">
          <span className="list-row__name">{item.name}</span>
          {foreign && (
            <span className="list-row__sub">
              <Amount value={item.amountDec} currency={item.currency} />
            </span>
          )}
        </span>
        <Amount value={item.amountBase} className="list-row__value" />
        <span className="list-row__chevron">
          <ChevronRightIcon size={16} />
        </span>
      </button>
    </li>
  );
}
