/** 第二層：一個大類底下的所有項目，依分類分組；點項目再往下一層編輯 */
import {
  CATEGORY_LABELS,
  GROUP_CATEGORIES,
  GROUP_LABELS,
  type ValuedItem,
  isCategoryGroup,
  subtypeLabel,
  summarize,
} from "@core";
import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Amount } from "../components/Amount";
import { ChevronRightIcon, PlusIcon } from "../components/Icons";
import {
  CategoryBadge,
  type CreateRequest,
  ItemCreateModal,
} from "../components/ItemCreateModal";
import { Page } from "../components/Page";
import { useAppData } from "../hooks/useAppData";
import { GROUP_COLORS } from "../lib/constants";

export function GroupPage() {
  const { group } = useParams();
  const { items, rates } = useAppData();
  const navigate = useNavigate();
  const [creating, setCreating] = useState<CreateRequest | null>(null);
  const summary = useMemo(() => summarize(items, rates), [items, rates]);

  if (!group || !isCategoryGroup(group))
    return <Navigate to="/overview" replace />;

  const { total, count } = summary.groups[group];
  const sections = GROUP_CATEGORIES[group]
    .map((category) => ({
      category,
      list: summary.items.filter((i) => i.category === category),
    }))
    .filter((s) => s.list.length > 0);

  return (
    <Page
      title={GROUP_LABELS[group]}
      backHref="/overview"
      backText="總覽"
      end={
        <button
          type="button"
          className="nav-bar__button"
          aria-label="新增項目"
          onClick={() => setCreating({ group })}
        >
          <PlusIcon size={22} />
        </button>
      }
    >
      <header className="sub-hero">
        <span className="sub-hero__label">
          <span
            className="swatch"
            style={{ background: GROUP_COLORS[group] }}
          />
          {group === "liability" ? "負債" : "資產"} · {count} 個項目
        </span>
        <Amount value={total} className="sub-hero__value" />
      </header>

      {sections.length === 0 ? (
        <div className="empty">
          <p>這個大類還沒有項目。</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setCreating({ group })}
          >
            新增項目
          </button>
        </div>
      ) : (
        sections.map(({ category, list }) => (
          <section
            key={category}
            className="list-group"
            aria-labelledby={`cat-${category}`}
          >
            <h2
              id={`cat-${category}`}
              className="list-group__label list-group__label--split"
            >
              <span>{CATEGORY_LABELS[category]}</span>
              <Amount value={summary.categories[category].total} />
            </h2>
            <ul className="list">
              {list.map((v) => (
                <ItemRow
                  key={v.id}
                  item={v}
                  onOpen={() => navigate(`/overview/${group}/${v.id}`)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      <ItemCreateModal request={creating} onClose={() => setCreating(null)} />
    </Page>
  );
}

function ItemRow({ item, onOpen }: { item: ValuedItem; onOpen: () => void }) {
  const foreign = item.currency !== "TWD";
  const detail = [
    subtypeLabel(item.category, item.subtype),
    item.sourceType === "loan" ? "依還款表自動計算" : null,
  ].filter(Boolean);
  return (
    <li>
      <button
        type="button"
        className="list-row list-row--button"
        onClick={onOpen}
      >
        <CategoryBadge category={item.category} />
        <span className="list-row__main">
          <span className="list-row__name">{item.name}</span>
          {foreign && (
            <span className="list-row__sub">
              <Amount value={item.amountDec} currency={item.currency} />
            </span>
          )}
          {detail.length > 0 && (
            <span className="list-row__sub">{detail.join(" · ")}</span>
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
