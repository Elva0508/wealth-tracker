/**
 * 首頁的大類手風琴：只列出有項目的大類。
 * - 收合：大類名稱、項目數、總額（更新日只顯示在各項目上）
 * - 展開：標題換成大類色底，下方直接列出這個大類的所有項目（不再分小類）
 * - 左側色條把同一個大類的標題與項目框在一起
 */
import {
  CATEGORY_GROUPS,
  CATEGORY_LABELS,
  type CategoryGroup,
  type Dec,
  GROUP_CATEGORIES,
  GROUP_LABELS,
  type ValuedItem,
  ZERO,
  subtypeLabel,
  taipeiDate,
} from '@core';
import type { CSSProperties } from 'react';
import { useAppData } from '../hooks/useAppData';
import { GROUP_COLORS, formatMonthDay, isDarkColor } from '../lib/constants';
import { Amount } from './Amount';
import { ChevronRightIcon } from './Icons';
import { CategoryBadge } from './ItemCreateModal';

interface GroupView {
  group: CategoryGroup;
  items: ValuedItem[];
  total: Dec;
}

interface Props {
  items: ValuedItem[];
  totals: Record<CategoryGroup, { total: Dec }>;
  open: ReadonlySet<CategoryGroup>;
  onToggle: (group: CategoryGroup) => void;
  onOpenItem: (id: string) => void;
}

export function GroupAccordion({ items, totals, open, onToggle, onOpenItem }: Props) {
  const { items: rawItems, today } = useAppData();

  // 最後更新日：手動項目看最後一次修改；依還款表計算的貸款每天自動更新
  const updatedOn = new Map(
    rawItems.map((i) => [i.id, i.sourceType === 'loan' ? today : taipeiDate(new Date(i.updatedAt))]),
  );
  const dateOf = (item: ValuedItem) => updatedOn.get(item.id) ?? today;

  const groups: GroupView[] = CATEGORY_GROUPS.map((group) => {
    const order = GROUP_CATEGORIES[group] as readonly string[];
    const list = items
      .filter((i) => order.includes(i.category))
      .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
    return { group, items: list, total: totals[group].total ?? ZERO };
  }).filter((g) => g.items.length > 0);

  return (
    <div className="accordion">
      {groups.map((g) => (
        <GroupSection
          key={g.group}
          view={g}
          open={open.has(g.group)}
          today={today}
          dateOf={dateOf}
          onToggle={() => onToggle(g.group)}
          onOpenItem={onOpenItem}
        />
      ))}
    </div>
  );
}

function GroupSection({
  view,
  open,
  today,
  dateOf,
  onToggle,
  onOpenItem,
}: {
  view: GroupView;
  open: boolean;
  today: string;
  dateOf: (item: ValuedItem) => string;
  onToggle: () => void;
  onOpenItem: (id: string) => void;
}) {
  const { group, items, total } = view;
  const color = GROUP_COLORS[group];
  const liability = group === 'liability';
  const style = {
    '--group-color': color,
    '--group-ink': isDarkColor(color) ? '#fff' : 'var(--ink)',
  } as CSSProperties;

  return (
    <section id={`acc-${group}`} className={`acc ${open ? 'acc--open' : ''}`} style={style}>
      <span className="acc__strip" aria-hidden="true" />
      <div className="acc__body">
        <button
          type="button"
          className="acc__head"
          aria-expanded={open}
          aria-controls={`acc-list-${group}`}
          onClick={onToggle}
        >
          <span className="acc__title">
            <span className="acc__name">{GROUP_LABELS[group]}</span>
            <span className="acc__sub">{items.length} 個項目</span>
          </span>
          <span className="acc__side">
            <span className="acc__total">
              {liability && <span className="acc__minus" aria-label="負債" />}
              <Amount value={total} />
            </span>
          </span>
          <span className="acc__chevron" aria-hidden="true">
            <ChevronRightIcon size={18} />
          </span>
        </button>

        {open && (
          <ul className="acc__list" id={`acc-list-${group}`}>
            {items.map((item) => (
              <li key={item.id}>
                <ItemCard item={item} date={formatMonthDay(dateOf(item), today)} onOpen={() => onOpenItem(item.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ItemCard({ item, date, onOpen }: { item: ValuedItem; date: string; onOpen: () => void }) {
  const kind = subtypeLabel(item.category, item.subtype) ?? CATEGORY_LABELS[item.category];
  const foreign = item.currency !== 'TWD';
  return (
    <button type="button" className={`acc-item acc-item--${item.kind}`} onClick={onOpen}>
      <CategoryBadge category={item.category} />
      <span className="acc-item__main">
        <span className="acc-item__name">{item.name}</span>
        <span className="acc-item__sub">
          {kind}
          {foreign && (
            <>
              {' · '}
              <Amount value={item.amountDec} currency={item.currency} />
            </>
          )}
        </span>
      </span>
      <span className="acc-item__side">
        <Amount value={item.amountBase} className="acc-item__amount" />
        <span className="acc-item__date">{date}</span>
      </span>
    </button>
  );
}
