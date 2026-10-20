/**
 * 貸款的「從哪天起」紀錄：切換還款方式、利率變動、提前還款、校正餘額。
 * 送出後重新讀取資料，還款表與首頁金額會立刻跟著更新。
 */
import {
  type ModeInputErrors,
  type RepaymentMode,
  dec,
  isIsoDate,
  modeOn,
  parseAmountInput,
  parseRateInput,
  validateModeInput,
} from '@core';
import { type FormEvent, useState } from 'react';
import { type LoanView, useAppData } from '../hooks/useAppData';
import * as api from '../lib/api';
import { Amount } from './Amount';
import { ModeFields } from './ModeFields';

export type LoanRecordKind = 'mode' | 'rate' | 'prepayment' | 'balance';

export const RECORD_TITLES: Record<LoanRecordKind, string> = {
  mode: '切換還款方式',
  rate: '記錄利率變動',
  prepayment: '提前還款',
  balance: '校正餘額',
};

export function LoanRecordForm({ loan, kind, onSaved }: { loan: LoanView; kind: LoanRecordKind; onSaved: () => void }) {
  const { today, reload } = useAppData();
  const current = modeOn(loan, today);
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<RepaymentMode>(current?.mode === 'defer_all' ? 'interest_only' : 'annuity');
  const [termMonths, setTermMonths] = useState('');
  const [interestEvery, setInterestEvery] = useState(current?.interestEvery ?? 12);
  const [rate, setRate] = useState('');
  const [amount, setAmount] = useState('');
  const [keep, setKeep] = useState<'term' | 'payment'>('term');
  const [errors, setErrors] = useState<ModeInputErrors & { date?: string; rate?: string; amount?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!isIsoDate(date)) next.date = '請選擇日期';
    else if (date <= loan.startDate) next.date = '日期要在起算日之後';
    let save: (() => Promise<void>) | null = null;

    if (kind === 'mode') {
      const result = validateModeInput({ effectiveDate: date, mode, termMonths, interestEvery });
      if (!result.ok) Object.assign(next, result.errors);
      else save = () => api.saveModeChange(loan.id, result.value);
    } else if (kind === 'rate') {
      const parsed = parseRateInput(rate);
      if (!parsed.ok) next.rate = parsed.error;
      else save = () => api.saveRateChange(loan.id, date, parsed.value);
    } else {
      const parsed = parseAmountInput(amount);
      if (!parsed.ok) next.amount = parsed.error;
      else if (kind === 'prepayment' && dec(parsed.value) === 0n) next.amount = '金額要大於 0';
      else save = () => api.addAdjustment(loan.id, { date, kind, amount: parsed.value, keep });
    }

    if (Object.keys(next).length > 0 || !save) {
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    setSaveError(null);
    try {
      await save();
      await reload();
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const dateLabel = kind === 'mode' || kind === 'rate' ? '從哪天起' : kind === 'prepayment' ? '還款日' : '校正日期';

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="list-group">
        <div className="list">
          <label className="list-row list-row--field">
            <span className="list-row__label">{dateLabel}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          {kind === 'rate' && (
            <label className="list-row list-row--field">
              <span className="list-row__label">年利率</span>
              <input
                className="amount-input"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="例如 2.31"
                aria-invalid={errors.rate ? true : undefined}
              />
              <span className="list-row__unit">%</span>
            </label>
          )}
          {(kind === 'prepayment' || kind === 'balance') && (
            <label className="list-row list-row--field">
              <span className="list-row__label">{kind === 'prepayment' ? '多還的本金' : '實際剩餘本金'}</span>
              <input
                className="amount-input"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                aria-invalid={errors.amount ? true : undefined}
              />
            </label>
          )}
        </div>
        {errors.date && <p className="field__error">{errors.date}</p>}
        {errors.rate && <p className="field__error">{errors.rate}</p>}
        {errors.amount && <p className="field__error">{errors.amount}</p>}
        <p className="list-group__note">{NOTES[kind]}</p>
      </div>

      {kind === 'mode' && (
        <ModeFields
          mode={mode}
          termMonths={termMonths}
          interestEvery={interestEvery}
          errors={errors}
          onChange={(n) => {
            if (n.mode) setMode(n.mode);
            if (n.termMonths !== undefined) setTermMonths(n.termMonths);
            if (n.interestEvery !== undefined) setInterestEvery(n.interestEvery);
          }}
        />
      )}

      {kind === 'prepayment' && (
        <div className="segmented" role="group" aria-label="提前還款後">
          <button type="button" aria-pressed={keep === 'term'} onClick={() => setKeep('term')}>
            降低每期金額
          </button>
          <button type="button" aria-pressed={keep === 'payment'} onClick={() => setKeep('payment')}>
            縮短還款期間
          </button>
        </div>
      )}

      {kind === 'balance' && (
        <p className="list-group__note">
          目前算出的餘額：
          <Amount value={dec(loan.item.amount)} currency={loan.currency === 'TWD' ? undefined : loan.currency} />
        </p>
      )}

      {saveError && (
        <p className="field__error" role="alert">
          儲存失敗：{saveError}
        </p>
      )}
      <button type="submit" className="btn btn--primary" disabled={saving}>
        {saving ? '儲存中…' : '儲存'}
      </button>
    </form>
  );
}

const NOTES: Record<LoanRecordKind, string> = {
  mode: '從這天當天或之後的第一個扣款日起，改用新的還款方式。學貸每年申請展延時，再記一筆就好。同一天已經有紀錄時會直接取代。',
  rate: '利率從這天之後開始的那一期起適用；本息平均攤還會用剩餘期數重算每期金額。同一天已經有紀錄時會直接取代。',
  prepayment: '多還的金額直接扣在本金上。',
  balance: '和銀行的對帳單不一致時，把剩餘本金改成銀行的數字，之後的還款表會從這裡接著算。',
};
