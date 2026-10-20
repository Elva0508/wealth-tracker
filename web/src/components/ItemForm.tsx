/**
 * 新增或編輯一個資產／負債項目的表單（iOS 分組清單樣式）。
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
import { IonLabel, IonSegment, IonSegmentButton } from '@ionic/react';
import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { useAppData } from '../hooks/useAppData';
import * as api from '../lib/api';
import { CATEGORY_COLORS, CURRENCIES } from '../lib/constants';
import { CheckIcon } from './Icons';

type Props = {
  /** 有給就是編輯，否則是新增 */
  item?: api.Item;
  initialKind?: ItemKind;
  initialCategory?: Category;
  onSaved: () => void;
  /** 儲存鍵下方的額外按鈕，例如封存 */
  footer?: ReactNode;
};

export function ItemForm({ item, initialKind = 'asset', initialCategory, onSaved, footer }: Props) {
  const { items, rates, reload } = useAppData();

  const [kind, setKind] = useState<ItemKind>(item?.kind ?? (initialCategory ? kindOf(initialCategory) : initialKind));
  const [category, setCategory] = useState<Category>(
    item?.category ?? initialCategory ?? (kind === 'asset' ? 'cash_bank' : 'loan'),
  );
  const [name, setName] = useState(item?.name ?? '');
  const [currency, setCurrency] = useState(item?.currency ?? 'TWD');
  const [amount, setAmount] = useState(item?.amount ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [errors, setErrors] = useState<ItemInputErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const categories = kind === 'asset' ? ASSET_CATEGORIES : LIABILITY_CATEGORIES;
  const otherNames = items.filter((i) => i.id !== item?.id).map((i) => i.name);
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
      if (item) {
        await api.updateItem(item.id, result.value);
      } else {
        const inCategory = items.filter((i) => i.category === result.value.category);
        const nextOrder = inCategory.reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1;
        await api.createItem(result.value, nextOrder);
      }
      await reload();
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      {!item && (
        <IonSegment value={kind} onIonChange={(e) => switchKind(e.detail.value as ItemKind)}>
          <IonSegmentButton value="asset">
            <IonLabel>資產</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="liability">
            <IonLabel>負債</IonLabel>
          </IonSegmentButton>
        </IonSegment>
      )}

      <fieldset className="list-group">
        <legend className="list-group__label">分類</legend>
        <div className="list">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className="list-row list-row--button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              <span className="swatch" style={{ background: CATEGORY_COLORS[c] }} />
              <span className="list-row__main">{CATEGORY_LABELS[c]}</span>
              {category === c && (
                <span className="list-row__check">
                  <CheckIcon size={18} />
                </span>
              )}
            </button>
          ))}
        </div>
        {errors.category && <p className="field__error">{errors.category}</p>}
      </fieldset>

      <div className="list-group">
        <div className="list">
          <label className="list-row list-row--field">
            <span className="list-row__label">名稱</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} maxLength={60} />
          </label>
          <label className="list-row list-row--field">
            <span className="list-row__label">幣別</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {/* 編輯時保留清單外的幣別 */}
              {[...new Set([...CURRENCIES, currency])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="list-row list-row--field">
            <span className="list-row__label">{kind === 'asset' ? '金額' : '目前欠款'}</span>
            <input
              className="amount-input"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              aria-invalid={errors.amount ? true : undefined}
            />
          </label>
        </div>
        {errors.name && <p className="field__error">{errors.name}</p>}
        {errors.amount && <p className="field__error">{errors.amount}</p>}
        {preview && <p className="list-group__note">{preview}</p>}
        {kind === 'liability' && !preview && <p className="list-group__note">欠款請輸入正數</p>}
      </div>

      <div className="list-group">
        <div className="list">
          <label className="list-row list-row--field list-row--stacked">
            <span className="list-row__label">備註</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="選填"
            />
          </label>
        </div>
        {errors.notes && <p className="field__error">{errors.notes}</p>}
      </div>

      {saveError && (
        <p className="field__error" role="alert">
          儲存失敗：{saveError}
        </p>
      )}

      <button type="submit" className="btn btn--primary" disabled={saving}>
        {saving ? '儲存中…' : '儲存'}
      </button>
      {footer}
    </form>
  );
}
