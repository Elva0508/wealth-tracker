/** 選擇還款方式（新增貸款與切換還款方式共用） */
import { REPAYMENT_MODES, REPAYMENT_MODE_LABELS, type RepaymentMode, modeHasTerm } from '@core';
import { CheckIcon } from './Icons';

const MODE_HINTS: Record<RepaymentMode, string> = {
  defer_all: '不用繳錢，也不計息（例如學貸在學期間）',
  interest_only: '本金不動，只繳利息（例如學貸緩繳本金、寬限期）',
  annuity: '每期繳的金額相同，最常見',
  equal_principal: '每期還的本金相同，利息逐期減少',
  bullet: '每月只繳息，最後一期還清本金',
};

export const INTEREST_EVERY_OPTIONS = [
  { value: 1, label: '每月' },
  { value: 3, label: '每 3 個月' },
  { value: 6, label: '每半年' },
  { value: 12, label: '每年' },
];

export function ModeFields({
  mode,
  termMonths,
  interestEvery,
  onChange,
  errors,
}: {
  mode: RepaymentMode;
  termMonths: string;
  interestEvery: number;
  onChange: (next: { mode?: RepaymentMode; termMonths?: string; interestEvery?: number }) => void;
  errors: { mode?: string; termMonths?: string; interestEvery?: string };
}) {
  return (
    <>
      <fieldset className="list-group">
        <legend className="list-group__label">還款方式</legend>
        <div className="list">
          {REPAYMENT_MODES.map((m) => (
            <button
              key={m}
              type="button"
              className="list-row list-row--button"
              aria-pressed={mode === m}
              onClick={() => onChange({ mode: m })}
            >
              <span className="list-row__main">
                <span>{REPAYMENT_MODE_LABELS[m]}</span>
                <span className="list-row__sub">{MODE_HINTS[m]}</span>
              </span>
              {mode === m && (
                <span className="list-row__check">
                  <CheckIcon size={18} />
                </span>
              )}
            </button>
          ))}
        </div>
        {errors.mode && <p className="field__error">{errors.mode}</p>}
      </fieldset>

      {modeHasTerm(mode) && (
        <div className="list-group">
          <div className="list">
            <label className="list-row list-row--field">
              <span className="list-row__label">期數</span>
              <input
                inputMode="numeric"
                value={termMonths}
                onChange={(e) => onChange({ termMonths: e.target.value })}
                placeholder="例如 240"
                aria-invalid={errors.termMonths ? true : undefined}
              />
              <span className="list-row__unit">個月</span>
            </label>
          </div>
          {errors.termMonths && <p className="field__error">{errors.termMonths}</p>}
          <p className="list-group__note">從這個還款方式開始算，還要繳幾期（20 年 = 240 期）。</p>
        </div>
      )}

      {mode === 'interest_only' && (
        <div className="list-group">
          <div className="list">
            <label className="list-row list-row--field">
              <span className="list-row__label">繳息頻率</span>
              <select value={interestEvery} onChange={(e) => onChange({ interestEvery: Number(e.target.value) })}>
                {INTEREST_EVERY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {errors.interestEvery && <p className="field__error">{errors.interestEvery}</p>}
          <p className="list-group__note">臺灣銀行就學貸款的緩繳本金期間是每年繳一次息。</p>
        </div>
      )}
    </>
  );
}

/** 某一筆還款方式的簡短說明，例如「本息平均攤還 240 期」「只繳息・每年」 */
export function describeMode(change: { mode: RepaymentMode; termMonths: number | null; interestEvery: number | null }) {
  const label = REPAYMENT_MODE_LABELS[change.mode];
  if (modeHasTerm(change.mode)) return `${label} ${change.termMonths} 期`;
  if (change.mode === 'interest_only') {
    const every = INTEREST_EVERY_OPTIONS.find((o) => o.value === change.interestEvery)?.label ?? '每月';
    return `只繳息・${every}`;
  }
  return label;
}
