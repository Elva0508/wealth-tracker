/**
 * 新增項目的底部彈出面板，分三步：
 * 1. 大類（流動資金、投資…）可展開收合，展開後列出分類
 * 2. 分類有細項（電子錢包、股票、貸款…）時，再選細項
 * 3. 填寫表單，分類與細項已經帶好；貸款可選自動計算還款或手動輸入餘額
 */
import {
  CATEGORY_GROUPS,
  CATEGORY_LABELS,
  CATEGORY_SUBTYPES,
  type Category,
  type CategoryGroup,
  GROUP_CATEGORIES,
  GROUP_LABELS,
  groupOf,
  subtypeLabel,
} from '@core';
import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';
import { GROUP_COLORS, categoryColor, isDarkColor } from '../lib/constants';
import { CategoryIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons';
import { ItemForm } from './ItemForm';
import { LoanForm } from './LoanForm';
import { Sheet } from './Sheet';

export interface CreateRequest {
  /** 打開時先展開的大類 */
  group?: CategoryGroup;
  /** 直接跳到這個分類（有細項就停在細項清單） */
  category?: Category;
}

type Step =
  | { view: 'pick' }
  | { view: 'subtype'; category: Category }
  | { view: 'form'; category: Category; subtype: string | null };

export function ItemCreateModal({ request, onClose }: { request: CreateRequest | null; onClose: () => void }) {
  if (!request) return null;
  return (
    <Sheet title="新增項目" onClose={onClose}>
      {(close) => <AddFlow request={request} onDone={close} />}
    </Sheet>
  );
}

function firstStep(category: Category | undefined): Step {
  if (!category) return { view: 'pick' };
  return CATEGORY_SUBTYPES[category] ? { view: 'subtype', category } : { view: 'form', category, subtype: null };
}

function AddFlow({ request, onDone }: { request: CreateRequest; onDone: () => void }) {
  const [step, setStep] = useState<Step>(() => firstStep(request.category));
  const [open, setOpen] = useState<ReadonlySet<CategoryGroup>>(() => {
    const group = request.group ?? (request.category ? groupOf(request.category) : undefined);
    return new Set(group ? [group] : []);
  });
  const ref = useRef<HTMLDivElement>(null);

  // 換步驟時回到最上面
  useLayoutEffect(() => {
    ref.current?.closest('.sheet')?.scrollTo(0, 0);
  }, [step]);

  const toggle = (group: CategoryGroup) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  const back = () => {
    if (step.view === 'form' && CATEGORY_SUBTYPES[step.category]) setStep({ view: 'subtype', category: step.category });
    else setStep({ view: 'pick' });
  };

  return (
    <div ref={ref} className="add-flow" key={step.view}>
      {step.view === 'pick' && (
        <div className="picker">
          {CATEGORY_GROUPS.map((g) => (
            <GroupSection
              key={g}
              group={g}
              open={open.has(g)}
              onToggle={() => toggle(g)}
              onPick={(category) => setStep(firstStep(category))}
            />
          ))}
        </div>
      )}

      {step.view === 'subtype' && (
        <>
          <StepHeader category={step.category} subtype={null} onBack={back} />
          <div className="list-group">
            <div className="list">
              {CATEGORY_SUBTYPES[step.category]!.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className="list-row list-row--button"
                  onClick={() =>
                    setStep({
                      view: 'form',
                      category: step.category,
                      subtype: s.key,
                    })
                  }
                >
                  <span className="list-row__main">{s.label}</span>
                  <span className="list-row__chevron">
                    <ChevronRightIcon size={16} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {step.view === 'form' && (
        <>
          <StepHeader category={step.category} subtype={step.subtype} onBack={back} />
          {step.category === 'loan' ? (
            <LoanChoice subtype={step.subtype} onDone={onDone} />
          ) : (
            <ItemForm initialCategory={step.category} initialSubtype={step.subtype} onSaved={onDone} />
          )}
        </>
      )}
    </div>
  );
}

function GroupSection({
  group,
  open,
  onToggle,
  onPick,
}: {
  group: CategoryGroup;
  open: boolean;
  onToggle: () => void;
  onPick: (category: Category) => void;
}) {
  const color = GROUP_COLORS[group];
  const style = {
    '--group-color': color,
    '--group-ink': isDarkColor(color) ? '#fff' : 'var(--ink)',
  } as CSSProperties;
  return (
    <section className={`picker-group ${open ? 'picker-group--open' : ''}`} style={style}>
      <button
        type="button"
        className="picker-group__head"
        aria-expanded={open}
        aria-controls={`picker-${group}`}
        onClick={onToggle}
      >
        <span>{GROUP_LABELS[group]}</span>
        <span className="picker-group__chevron">
          <ChevronRightIcon size={18} />
        </span>
      </button>
      {open && (
        <div className="list picker-group__list" id={`picker-${group}`}>
          {GROUP_CATEGORIES[group].map((c) => (
            <button key={c} type="button" className="list-row list-row--button" onClick={() => onPick(c)}>
              <CategoryBadge category={c} />
              <span className="list-row__main">{CATEGORY_LABELS[c]}</span>
              <span className="list-row__chevron">
                <ChevronRightIcon size={16} />
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** 分類圖示放在淡淡的分類色圓底上 */
export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className="category-badge" style={{ '--badge-color': categoryColor(category) } as CSSProperties}>
      <CategoryIcon category={category} size={18} />
    </span>
  );
}

function StepHeader({ category, subtype, onBack }: { category: Category; subtype: string | null; onBack: () => void }) {
  const path = [GROUP_LABELS[groupOf(category)], CATEGORY_LABELS[category], subtypeLabel(category, subtype)];
  return (
    <div className="step-header">
      <button type="button" className="step-header__back" onClick={onBack} aria-label="回上一步">
        <ChevronLeftIcon size={20} />
      </button>
      <CategoryBadge category={category} />
      <span className="step-header__path">{path.filter(Boolean).join(' › ')}</span>
    </div>
  );
}

/** 貸款可以依還款表自動計算餘額，也可以像其他負債一樣手動輸入 */
function LoanChoice({ subtype, onDone }: { subtype: string | null; onDone: () => void }) {
  const [auto, setAuto] = useState(true);
  return (
    <>
      <div className="segmented" role="group" aria-label="餘額計算方式">
        <button type="button" aria-pressed={auto} onClick={() => setAuto(true)}>
          自動計算還款
        </button>
        <button type="button" aria-pressed={!auto} onClick={() => setAuto(false)}>
          手動輸入餘額
        </button>
      </div>
      {auto ? (
        <LoanForm initialSubtype={subtype} onSaved={onDone} />
      ) : (
        <ItemForm initialCategory="loan" initialSubtype={subtype} onSaved={onDone} />
      )}
    </>
  );
}
