/**
 * 首頁：淨資產 → 總資產／總負債 → 平衡長條 → 資產明細 → 負債明細。
 * 所有數字由 @core 的 summarize() 計算。
 */
import {
  ASSET_CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type ItemKind,
  LIABILITY_CATEGORIES,
  type ValuedItem,
  fxStatusFor,
  latestFetchedAt,
  summarize,
} from '@core';
import { useMemo, useState } from 'react';
import { Amount } from '../components/Amount';
import { BalanceColumns } from '../components/BalanceColumns';
import { CountUpAmount } from '../components/CountUpAmount';
import { CategoryIcon, ChevronDownIcon, EyeIcon, EyeOffIcon, PlusIcon } from '../components/Icons';
import { ItemSheet } from '../components/ItemSheet';
import { useAppData } from '../hooks/useAppData';
import type { Item } from '../lib/api';
import { formatDateTime } from '../lib/constants';

type SheetState =
  | { mode: 'create'; kind: ItemKind; category?: Category }
  | { mode: 'edit'; item: Item }
  | { mode: 'choose' }
  | null;

export function OverviewPage() {
  const { items, rates, loading, error, hidden, setHidden, ratesRefreshing } = useAppData();
  const [expanded, setExpanded] = useState<Set<Category>>(new Set());
  const [sheet, setSheet] = useState<SheetState>(null);

  const summary = useMemo(() => summarize(items, rates), [items, rates]);
  const fxStatus = fxStatusFor(summary.items.map((i) => i.currency), rates, new Date());
  const fetchedAt = latestFetchedAt(rates);
  const hasForeign = summary.items.some((i) => i.currency !== 'TWD');
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  if (loading) return <p className="page-message">載入中…</p>;
  if (error) return <p className="page-message" role="alert">讀取資料失敗：{error}</p>;

  /** 從雙柱的詳細卡片跳到分類明細：展開並捲動過去 */
  function openCategory(category: Category) {
    setExpanded((prev) => new Set(prev).add(category));
    requestAnimationFrame(() =>
      document.getElementById(`category-${category}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  function toggle(category: Category) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  const section = (kind: ItemKind, categories: readonly Category[]) => (
    <section className="group" aria-labelledby={`group-${kind}`}>
      <h2 id={`group-${kind}`}>{kind === 'asset' ? '資產' : '負債'}</h2>
      {categories.map((category) => {
        const total = summary.categories[category];
        const list = summary.items.filter((i) => i.category === category);
        const open = expanded.has(category);
        return (
          <div key={category} id={`category-${category}`} className="card category">
            <button
              type="button"
              className="category__head"
              aria-expanded={open}
              onClick={() => (list.length === 0 ? setSheet({ mode: 'create', kind, category }) : toggle(category))}
            >
              <span className={`category__icon category__icon--${kind}`}>
                <CategoryIcon category={category} size={18} />
              </span>
              <span className="category__title">
                <span>{CATEGORY_LABELS[category]}</span>
                <span className="muted small">{list.length === 0 ? '點此新增' : `${list.length} 個項目`}</span>
              </span>
              <Amount value={total.total} className={`category__total ${list.length === 0 ? 'muted' : ''}`} />
              {list.length > 0 && (
                <span className={`chevron ${open ? 'chevron--open' : ''}`}>
                  <ChevronDownIcon size={16} />
                </span>
              )}
            </button>
            {open && list.length > 0 && (
              <ul className="category__items">
                {list.map((v) => (
                  <ItemRow key={v.id} item={v} onEdit={() => setSheet({ mode: 'edit', item: itemsById.get(v.id)! })} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );

  return (
    <div className="overview">
      <header className="hero">
        <div className="hero__top">
          <span className="hero__label">
            淨資產 <span className="chip">{summary.baseCurrency}</span>
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label={hidden ? '顯示金額' : '隱藏金額'}
            aria-pressed={!hidden}
            onClick={() => setHidden(!hidden)}
          >
            {hidden ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
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

      <div className="totals">
        <div className="card total">
          <span className="total__label">
            <span className="dot dot--asset" />
            總資產
          </span>
          <Amount value={summary.totalAssets} className="total__value" />
        </div>
        <div className="card total">
          <span className="total__label">
            <span className="dot dot--liability" />
            總負債
          </span>
          <Amount value={summary.totalLiabilities} className="total__value" />
        </div>
      </div>

      {summary.items.length === 0 ? (
        <div className="card empty">
          <p>還沒有任何資產或負債。</p>
          <p className="muted small">先新增銀行存款、股票市值或貸款餘額，首頁就會算出你的淨資產。</p>
          <button type="button" className="button button--primary" onClick={() => setSheet({ mode: 'choose' })}>
            新增第一個項目
          </button>
        </div>
      ) : (
        <BalanceColumns summary={summary} onOpenCategory={openCategory} />
      )}

      {section('asset', ASSET_CATEGORIES)}
      {section('liability', LIABILITY_CATEGORIES)}

      <button type="button" className="fab" aria-label="新增項目" onClick={() => setSheet({ mode: 'choose' })}>
        <PlusIcon size={24} />
      </button>

      {sheet?.mode === 'choose' && (
        <ItemSheet mode="create" initialKind="asset" onClose={() => setSheet(null)} />
      )}
      {sheet?.mode === 'create' && (
        <ItemSheet mode="create" initialKind={sheet.kind} initialCategory={sheet.category} onClose={() => setSheet(null)} />
      )}
      {sheet?.mode === 'edit' && <ItemSheet mode="edit" item={sheet.item} onClose={() => setSheet(null)} />}
    </div>
  );
}

function ItemRow({ item, onEdit }: { item: ValuedItem; onEdit: () => void }) {
  const foreign = item.currency !== 'TWD';
  return (
    <li>
      <button type="button" className="item-row" onClick={onEdit}>
        <span className="item-row__name">{item.name}</span>
        <span className="item-row__amounts">
          <Amount value={foreign ? item.amountDec : item.amountBase} currency={foreign ? item.currency : undefined} />
          {foreign && (
            <span className="muted small">
              ≈ <Amount value={item.amountBase} currency="TWD" />
            </span>
          )}
        </span>
      </button>
    </li>
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
