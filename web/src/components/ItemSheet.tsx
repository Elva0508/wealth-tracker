/**
 * 新增或編輯一個資產／負債項目。
 * 檢查規則在 @core 的 validateItemInput()，與資料庫的限制一致。
 */
import {
  ASSET_CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type ItemInputErrors,
  type ItemKind,
  LIABILITY_CATEGORIES,
  defaultItemName,
  formatMoney,
  dec,
  kindOf,
  mul,
  parseAmountInput,
  rateFor,
  validateItemInput,
} from '@core';
import { type FormEvent, useMemo, useState } from 'react';
import { useAppData } from '../hooks/useAppData';
import * as api from '../lib/api';
import { CURRENCIES } from '../lib/constants';
import { CategoryIcon } from './Icons';
import { Sheet } from './Sheet';

type Props =
  | { mode: 'create'; initialKind: ItemKind; initialCategory?: Category; onClose: () => void }
  | { mode: 'edit'; item: api.Item; onClose: () => void };

export function ItemSheet(props: Props) {
  const { items, rates, reload } = useAppData();
  const editing = props.mode === 'edit' ? props.item : null;

  const [kind, setKind] = useState<ItemKind>(editing ? editing.kind : props.mode === 'create' ? props.initialKind : 'asset');
  const [category, setCategory] = useState<Category>(() => {
    if (editing) return editing.category;
    if (props.mode === 'create' && props.initialCategory) return props.initialCategory;
    return kind === 'asset' ? 'cash_bank' : 'loan';
  });
  const [name, setName] = useState(editing?.name ?? '');
  const [currency, setCurrency] = useState(editing?.currency ?? 'TWD');
  const [amount, setAmount] = useState(editing?.amount ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [errors, setErrors] = useState<ItemInputErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const categories = kind === 'asset' ? ASSET_CATEGORIES : LIABILITY_CATEGORIES;
  const otherNames = items.filter((i) => i.id !== editing?.id).map((i) => i.name);
  const placeholder = defaultItemName(category, otherNames);

  // 外幣即時顯示新台幣估值
  const preview = useMemo(() => {
    if (currency === 'TWD') return null;
    const parsed = parseAmountInput(amount);
    if (!parsed.ok) return null;
    const rate = rateFor(rates, currency);
    if (rate === null) return '目前沒有這個幣別的匯率，儲存後不會計入總額，直到取得匯率';
    return `≈ ${formatMoney(mul(dec(parsed.value), rate), 'TWD')}`;
  }, [amount, currency, rates]);

  function switchKind(next: ItemKind) {
    setKind(next);
    setCategory(next === 'asset' ? 'cash_bank' : 'loan');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = validateItemInput({ category, name, currency, amount, notes }, otherNames);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    setSaveError(null);
    try {
      if (editing) {
        await api.updateItem(editing.id, result.value);
      } else {
        const inCategory = items.filter((i) => i.category === result.value.category);
        const nextOrder = inCategory.reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1;
        await api.createItem(result.value, nextOrder);
      }
      await reload();
      props.onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!editing) return;
    if (!window.confirm(`封存「${editing.name}」？封存後不計入總額，之後可在設定頁恢復。`)) return;
    setSaving(true);
    try {
      await api.setArchived(editing.id, true);
      await reload();
      props.onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <Sheet title={editing ? '編輯項目' : '新增項目'} onClose={props.onClose}>
      <form className="form" onSubmit={submit} noValidate>
        {!editing && (
          <div className="segmented" role="group" aria-label="類型">
            {(['asset', 'liability'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => switchKind(k)}>
                {k === 'asset' ? '資產' : '負債'}
              </button>
            ))}
          </div>
        )}

        <fieldset className="field">
          <legend>分類</legend>
          <div className="category-grid">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={`category-choice category-choice--${kindOf(c)}`}
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
              >
                <CategoryIcon category={c} size={22} />
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
          {errors.category && <p className="field__error">{errors.category}</p>}
        </fieldset>

        <label className="field">
          名稱
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} maxLength={60} />
          {errors.name && <span className="field__error">{errors.name}</span>}
        </label>

        <div className="field-row">
          <label className="field field--currency">
            幣別
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {/* 編輯時保留清單外的幣別 */}
              {[...new Set([...CURRENCIES, currency])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {kind === 'asset' ? '金額' : '目前欠款（輸入正數）'}
            <input
              className="amount-input"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              aria-invalid={errors.amount ? true : undefined}
            />
            {errors.amount && <span className="field__error">{errors.amount}</span>}
          </label>
        </div>
        {preview && <p className="muted small">{preview}</p>}

        <label className="field">
          備註（選填）
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} />
          {errors.notes && <span className="field__error">{errors.notes}</span>}
        </label>

        {saveError && <p className="field__error" role="alert">儲存失敗：{saveError}</p>}

        <button type="submit" className="button button--primary" disabled={saving}>
          {saving ? '儲存中…' : '儲存'}
        </button>
        {editing && (
          <button type="button" className="button button--quiet" onClick={archive} disabled={saving}>
            封存這個項目
          </button>
        )}
      </form>
    </Sheet>
  );
}
