/**
 * 新增貸款，或把原本手動輸入的貸款項目轉成自動計算。
 * 檢查規則在 @core 的 validateLoanInput()，資料庫也有對應的限制。
 */
import { type LoanInputErrors, type RepaymentMode, validateLoanInput } from '@core';
import { type FormEvent, useState } from 'react';
import { useAppData } from '../hooks/useAppData';
import * as api from '../lib/api';
import { ModeFields } from './ModeFields';

export function LoanForm({
  convert,
  onSaved,
}: {
  /** 有給時是轉換既有的手動項目 */
  convert?: api.Item;
  onSaved: (loanId: string) => void;
}) {
  const { items, today, reload } = useAppData();
  const [name, setName] = useState(convert?.name ?? '');
  const [startDate, setStartDate] = useState(today);
  const [principal, setPrincipal] = useState(convert ? String(Number(convert.amount)) : '');
  const [firstPaymentDate, setFirstPaymentDate] = useState('');
  const [annualRate, setAnnualRate] = useState('');
  const [mode, setMode] = useState<RepaymentMode>('annuity');
  const [termMonths, setTermMonths] = useState('');
  const [interestEvery, setInterestEvery] = useState(12);
  const [errors, setErrors] = useState<LoanInputErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = validateLoanInput({
      name,
      startDate,
      principal,
      firstPaymentDate,
      annualRate,
      mode,
      termMonths,
      interestEvery,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    setSaveError(null);
    try {
      const loans = items.filter((i) => i.category === 'loan');
      const loanId = await api.createLoan(result.value, {
        currency: convert?.currency ?? 'TWD',
        itemId: convert?.id,
        sortOrder: loans.reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1,
      });
      await reload();
      onSaved(loanId);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="list-group">
        <div className="list">
          <label className="list-row list-row--field">
            <span className="list-row__label">名稱</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如 房貸、學貸"
              maxLength={60}
            />
          </label>
        </div>
        {errors.name && <p className="field__error">{errors.name}</p>}
      </div>

      <div className="list-group">
        <div className="list">
          <label className="list-row list-row--field">
            <span className="list-row__label">起算日</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="list-row list-row--field">
            <span className="list-row__label">起算本金</span>
            <input
              className="amount-input"
              inputMode="decimal"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              placeholder="0"
              aria-invalid={errors.principal ? true : undefined}
            />
          </label>
          <label className="list-row list-row--field">
            <span className="list-row__label">第一次扣款</span>
            <input type="date" value={firstPaymentDate} onChange={(e) => setFirstPaymentDate(e.target.value)} />
          </label>
          <label className="list-row list-row--field">
            <span className="list-row__label">年利率</span>
            <input
              className="amount-input"
              inputMode="decimal"
              value={annualRate}
              onChange={(e) => setAnnualRate(e.target.value)}
              placeholder="例如 2.185"
              aria-invalid={errors.annualRate ? true : undefined}
            />
            <span className="list-row__unit">%</span>
          </label>
        </div>
        {(['startDate', 'principal', 'firstPaymentDate', 'annualRate'] as const).map(
          (key) =>
            errors[key] && (
              <p key={key} className="field__error">
                {errors[key]}
              </p>
            ),
        )}
        <p className="list-group__note">
          新貸款填撥款日與貸款金額。已經繳了一段時間的貸款，可以填最近一次扣款日與當時的剩餘本金，之後的還款表會從那天接著算。之後每月在「第一次扣款」的同一天扣款。
        </p>
      </div>

      <ModeFields
        mode={mode}
        termMonths={termMonths}
        interestEvery={interestEvery}
        errors={errors}
        onChange={(next) => {
          if (next.mode) setMode(next.mode);
          if (next.termMonths !== undefined) setTermMonths(next.termMonths);
          if (next.interestEvery !== undefined) setInterestEvery(next.interestEvery);
        }}
      />

      {saveError && (
        <p className="field__error" role="alert">
          儲存失敗：{saveError}
        </p>
      )}
      <button type="submit" className="btn btn--primary" disabled={saving}>
        {saving ? '儲存中…' : convert ? '轉成自動計算' : '新增貸款'}
      </button>
    </form>
  );
}
