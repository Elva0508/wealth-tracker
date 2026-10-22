/**
 * 新增貸款，或把原本手動輸入的貸款項目轉成自動計算。
 * 先選「全新貸款」或「已經在繳」，再填資料；下方即時顯示用同一套還款表推算的結果。
 * 檢查與推算規則在 @core 的 validateLoanInput()、previewLoan()，資料庫也有對應的限制。
 */
import {
  CATEGORY_SUBTYPES,
  type Dec,
  type LoanInputErrors,
  type LoanStage,
  type RepaymentMode,
  ZERO,
  dec,
  modeHasGrace,
  modeHasTerm,
  parseAmountInput,
  previewLoan,
  validateLoanInput,
} from '@core';
import { type FormEvent, useState } from 'react';
import { useAppData } from '../hooks/useAppData';
import * as api from '../lib/api';
import { formatDate } from '../lib/constants';
import { Amount } from './Amount';
import { ChevronRightIcon } from './Icons';
import { ModeFields } from './ModeFields';

const STAGES: { stage: LoanStage; title: string; hint: string }[] = [
  { stage: 'new', title: '全新貸款', hint: '剛撥款，或我知道當初的撥款日與貸款金額' },
  { stage: 'ongoing', title: '已經在繳', hint: '繳了一段時間，我知道現在的剩餘本金' },
];

export function LoanForm({
  convert,
  initialSubtype = null,
  onSaved,
}: {
  /** 有給時是轉換既有的手動項目 */
  convert?: api.Item;
  /** 貸款類型（房貸、學貸…），新增時從分類清單帶進來 */
  initialSubtype?: string | null;
  onSaved: (loanId: string) => void;
}) {
  const { items, today, reload } = useAppData();
  const currency = convert?.currency ?? 'TWD';
  const foreign = currency !== 'TWD' ? currency : undefined;
  const [stage, setStage] = useState<LoanStage | null>(null);
  const [name, setName] = useState(convert?.name ?? '');
  const [subtype, setSubtype] = useState(convert?.subtype ?? initialSubtype ?? '');
  const [mode, setMode] = useState<RepaymentMode>('annuity');
  const [interestEvery, setInterestEvery] = useState(12);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState('');
  const [annualRate, setAnnualRate] = useState('');
  const [graceMonths, setGraceMonths] = useState('');
  const [principal, setPrincipal] = useState(convert ? String(Number(convert.amount)) : '');
  const [bankPayment, setBankPayment] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const result = validateLoanInput({
    stage: stage ?? 'new',
    name,
    mode,
    startDate,
    principal,
    endDate,
    annualRate,
    graceMonths,
    interestEvery,
  });
  const preview = result.ok ? previewLoan(result.value, currency) : null;
  const errors: LoanInputErrors = showErrors && !result.ok ? result.errors : {};
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!result.ok) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const loans = items.filter((i) => i.category === 'loan');
      const loanId = await api.createLoan(result.value, {
        currency,
        subtype: subtype || null,
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
  if (stage === null) {
    return (
      <div className="form">
        <fieldset className="list-group">
          <legend className="list-group__label">這筆貸款是？</legend>
          <div className="list">
            {STAGES.map((s) => (
              <button
                key={s.stage}
                type="button"
                className="list-row list-row--button"
                onClick={() => setStage(s.stage)}
              >
                <span className="list-row__main">
                  <span>{s.title}</span>
                  <span className="list-row__sub">{s.hint}</span>
                </span>
                <span className="list-row__chevron">
                  <ChevronRightIcon size={16} />
                </span>
              </button>
            ))}
          </div>
          <p className="list-group__note">
            房貸、信貸、車貸、學貸都可以用；有寬限期或正在緩繳的貸款也一樣，下一步再選還款方式。
          </p>
        </fieldset>
      </div>
    );
  }
  const isNew = stage === 'new';
  const stageInfo = STAGES.find((s) => s.stage === stage)!;
  const hasTerm = modeHasTerm(mode);
  const hasGrace = modeHasGrace(mode);
  const grace =
    result.ok && result.value.afterGrace ? (result.value.periods ?? 0) - (result.value.afterGrace.termMonths ?? 0) : 0;
  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="list-group">
        <div className="list">
          <div className="list-row">
            <span className="list-row__main">
              <span>{stageInfo.title}</span>
              <span className="list-row__sub">{stageInfo.hint}</span>
            </span>
            <button type="button" className="text-button list-row__action" onClick={() => setStage(null)}>
              更改
            </button>
          </div>
          <label className="list-row list-row--field">
            <span className="list-row__label">名稱</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如 房貸、學貸"
              maxLength={60}
            />
          </label>
          <label className="list-row list-row--field">
            <span className="list-row__label">類型</span>
            <select value={subtype} onChange={(e) => setSubtype(e.target.value)}>
              <option value="">不指定</option>
              {CATEGORY_SUBTYPES.loan?.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {errors.name && <p className="field__error">{errors.name}</p>}
      </div>
      <ModeFields
        mode={mode}
        termMonths=""
        interestEvery={interestEvery}
        errors={errors}
        withTerm={false}
        onChange={(next) => {
          if (next.mode) setMode(next.mode);
          if (next.interestEvery !== undefined) setInterestEvery(next.interestEvery);
        }}
      />
      <div className="list-group">
        <div className="list">
          <label className="list-row list-row--field">
            <span className="list-row__label">{isNew ? '貸款起日' : '最近一次扣款日'}</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          {hasTerm && (
            <label className="list-row list-row--field">
              <span className="list-row__label">到期日</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-invalid={errors.endDate ? true : undefined}
              />
            </label>
          )}
        </div>
        {(['startDate', 'endDate'] as const).map(
          (key) =>
            errors[key] && (
              <p key={key} className="field__error">
                {errors[key]}
              </p>
            ),
        )}
        <p className="list-group__note">
          {isNew
            ? '貸款起日就是撥款日；第一次扣款是下個月的同一天，之後每月同一天扣款。'
            : '剩餘本金填最近一次扣款後的數字；下一次扣款是下個月的同一天。到期日通常在銀行 App 的貸款明細裡看得到。'}
          {hasTerm && '期數會用到期日自動推算。'}
        </p>
      </div>
      <div className="list-group">
        <div className="list">
          <label className="list-row list-row--field">
            <span className="list-row__label">{isNew ? '年利率' : '目前年利率'}</span>
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
          {hasGrace && (
            <label className="list-row list-row--field">
              <span className="list-row__label">{isNew ? '寬限期' : '寬限期還剩'}</span>
              <input
                inputMode="numeric"
                value={graceMonths}
                onChange={(e) => setGraceMonths(e.target.value)}
                placeholder="沒有就空白"
                aria-invalid={errors.graceMonths ? true : undefined}
              />
              <span className="list-row__unit">{isNew ? '個月' : '期'}</span>
            </label>
          )}
          <label className="list-row list-row--field">
            <span className="list-row__label">{isNew ? '原始貸款金額' : '剩餘本金'}</span>
            <input
              className="amount-input"
              inputMode="decimal"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              placeholder="0"
              aria-invalid={errors.principal ? true : undefined}
            />
            {foreign && <span className="list-row__unit">{foreign}</span>}
          </label>
        </div>
        {(['annualRate', 'graceMonths', 'principal', 'interestEvery'] as const).map(
          (key) =>
            errors[key] && (
              <p key={key} className="field__error">
                {errors[key]}
              </p>
            ),
        )}
        {hasGrace && (
          <p className="list-group__note">
            {isNew
              ? '寬限期含在貸款年限內：寬限期間每月只繳息，結束後用剩下的期數攤還本金（例如 20 年含寬限 3 年，就填 36 個月）。'
              : '還在寬限期的話，填還剩幾期只繳息；寬限期結束後會用剩下的期數攤還本金。'}
          </p>
        )}
      </div>
      <Preview
        stage={stage}
        mode={mode}
        preview={preview}
        periods={result.ok ? result.value.periods : null}
        grace={grace}
        today={today}
        currency={foreign}
        bankPayment={bankPayment}
        onBankPayment={setBankPayment}
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

/** 推算結果：讓使用者和銀行 App 上的數字對照 */
function Preview({
  stage,
  mode,
  preview,
  periods,
  grace,
  today,
  currency,
  bankPayment,
  onBankPayment,
}: {
  stage: LoanStage;
  mode: RepaymentMode;
  preview: ReturnType<typeof previewLoan> | null;
  periods: number | null;
  grace: number;
  today: string;
  currency: string | undefined;
  bankPayment: string;
  onBankPayment: (value: string) => void;
}) {
  if (!preview) {
    return (
      <section className="list-group">
        <h3 className="list-group__label">推算結果</h3>
        <div className="list">
          <p className="list-row list-row--text">填完上面的資料後，這裡會顯示每月要繳多少、最後一期是哪天。</p>
        </div>
      </section>
    );
  }
  const isNew = stage === 'new';
  // 和銀行比對的金額：已經在繳且還在寬限期時，銀行顯示的是利息；其他時候是每期金額
  const compareTo = !isNew && grace > 0 ? preview.gracePayment : preview.regularPayment;
  const bank = parseAmountInput(bankPayment);
  let diff: Dec | null = null;
  let tooFar = false;
  if (compareTo !== null && bank.ok && bankPayment.trim() !== '') {
    const bankValue = dec(bank.value);
    diff = compareTo - bankValue;
    const abs = diff < ZERO ? -diff : diff;
    tooFar = abs * 100n > bankValue;
  }
  const regularLabel =
    mode === 'equal_principal' ? '攤還第一期' : mode === 'bullet' || mode === 'interest_only' ? '每期繳息' : '每月繳款';
  return (
    <section className="list-group">
      <h3 className="list-group__label">推算結果</h3>
      <div className="list">
        {periods !== null && (
          <div className="list-row">
            <span className="list-row__main">{isNew ? '總期數' : '還剩'}</span>
            <span className="list-row__detail">
              {periods} 期{grace > 0 && `（寬限 ${grace} 期 + 攤還 ${periods - grace} 期）`}
            </span>
          </div>
        )}
        {preview.first ? (
          <div className="list-row">
            <span className="list-row__main">{isNew ? '第一次扣款' : '下一次扣款'}</span>
            <span className="list-row__detail">
              {formatDate(preview.first.date, today)}・
              <Amount value={preview.first.payment} currency={currency} alwaysVisible />
            </span>
          </div>
        ) : (
          <p className="list-row list-row--text">
            緩繳期間不用繳款，也不計息。開始還款時，再到貸款頁記錄新的還款方式。
          </p>
        )}
        {preview.gracePayment !== null && (
          <div className="list-row">
            <span className="list-row__main">寬限期每月繳息</span>
            <span className="list-row__detail">
              <Amount value={preview.gracePayment} currency={currency} alwaysVisible />
            </span>
          </div>
        )}
        {preview.regularPayment !== null && (
          <div className="list-row">
            <span className="list-row__main">
              <span>{regularLabel}</span>
              {mode === 'equal_principal' && <span className="list-row__sub">之後利息逐月減少，每期金額跟著變少</span>}
              {mode === 'bullet' && <span className="list-row__sub">最後一期連本金一起還清</span>}
            </span>
            <span className="list-row__detail">
              <Amount value={preview.regularPayment} currency={currency} alwaysVisible />
            </span>
          </div>
        )}
        {preview.last && (
          <div className="list-row">
            <span className="list-row__main">最後一期</span>
            <span className="list-row__detail">
              {formatDate(preview.last.date, today)}・
              <Amount value={preview.last.payment} currency={currency} alwaysVisible />
            </span>
          </div>
        )}
        {preview.totalInterest !== null && (
          <div className="list-row">
            <span className="list-row__main">{isNew ? '利息合計' : '之後的利息合計'}</span>
            <span className="list-row__detail">
              <Amount value={preview.totalInterest} currency={currency} alwaysVisible />
            </span>
          </div>
        )}
        {compareTo !== null && (
          <label className="list-row list-row--field">
            <span className="list-row__label">銀行的金額</span>
            <input
              className="amount-input"
              inputMode="decimal"
              value={bankPayment}
              onChange={(e) => onBankPayment(e.target.value)}
              placeholder="選填，用來比對"
            />
          </label>
        )}
      </div>
      {diff !== null &&
        (diff === ZERO ? (
          <p className="list-group__note">和銀行的金額一致。</p>
        ) : (
          <p className={tooFar ? 'list-group__note list-group__note--warn' : 'list-group__note'}>
            推算結果比銀行{diff > ZERO ? '多' : '少'}{' '}
            <Amount value={diff < ZERO ? -diff : diff} currency={currency} alwaysVisible />
            {tooFar
              ? '，差距超過 1%，請確認年利率、到期日與金額是否正確。'
              : '，是銀行四捨五入或計息天數的小差異，之後可以用「校正餘額」對齊。'}
          </p>
        ))}
      {compareTo !== null && diff === null && (
        <p className="list-group__note">
          {!isNew && grace > 0 ? '填銀行顯示的每月利息' : '填銀行顯示的每期繳款金額'}
          ，會和推算結果比對，不會存起來。
        </p>
      )}
    </section>
  );
}
