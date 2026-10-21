/**
 * 貸款的兩個面板：
 * - LoanDetailSheet：點貸款卡片打開，分「編輯」與「紀錄」
 * - RepaySheet：點卡片上的「還款」打開，還款試算表；可記錄全額或部分提前還款
 *
 * 依排程的每月扣款由還款表自動扣除，不用手動確認。
 */
import {
  CATEGORY_SUBTYPES,
  NAME_MAX_LENGTH,
  type ScheduleRow,
  ZERO,
  dec,
  isIsoDate,
  loanBalanceOn,
  parseAmountInput,
  toFixedString,
} from '@core';
import { type ReactNode, useState } from 'react';
import { type LoanView, useAppData } from '../hooks/useAppData';
import { useTask } from '../hooks/useTask';
import * as api from '../lib/api';
import { formatDate } from '../lib/constants';
import { summarizeLoan } from '../lib/loanSummary';
import { Amount } from './Amount';
import { CheckIcon, ChevronRightIcon } from './Icons';
import { type LoanRecordKind, LoanRecordForm, RECORD_TITLES } from './LoanRecordForm';
import { describeMode } from './ModeFields';
import { Sheet } from './Sheet';
import { TaskNotice } from './TaskNotice';

const foreignOf = (loan: LoanView) => (loan.currency !== 'TWD' ? loan.currency : undefined);
const rateText = (rate: string) => `${Number(rate)}%`;

/** 'YYYY-MM-DD' → '2026年10月21日' */
function longDate(date: string) {
  const [y, m, d] = date.split('-');
  return `${y}年${Number(m)}月${Number(d)}日`;
}

// ---------------------------------------------------------------------------
// 編輯／紀錄
// ---------------------------------------------------------------------------

export function LoanDetailSheet({ loanId, onClose }: { loanId: string; onClose: () => void }) {
  const { loans } = useAppData();
  const [tab, setTab] = useState<'edit' | 'history'>('edit');
  const [editing, setEditing] = useState<LoanRecordKind | null>(null);
  const loan = loans.find((l) => l.id === loanId);
  if (!loan) return null;

  return (
    <>
      <Sheet
        title={loan.item.name}
        cancelLabel="關閉"
        onClose={onClose}
        heading={
          <div className="segmented sheet-tabs" role="tablist" aria-label="檢視">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'edit'}
              aria-pressed={tab === 'edit'}
              onClick={() => setTab('edit')}
            >
              編輯
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'history'}
              aria-pressed={tab === 'history'}
              onClick={() => setTab('history')}
            >
              紀錄
            </button>
          </div>
        }
      >
        {(close) =>
          tab === 'edit' ? (
            <LoanEditPanel key={loan.id} loan={loan} onRecord={setEditing} onArchived={close} />
          ) : (
            <LoanHistory loan={loan} />
          )
        }
      </Sheet>

      {editing && (
        <Sheet title={RECORD_TITLES[editing]} onClose={() => setEditing(null)}>
          {(close) => <LoanRecordForm loan={loan} kind={editing} onSaved={close} />}
        </Sheet>
      )}
    </>
  );
}

function LoanEditPanel({
  loan,
  onRecord,
  onArchived,
}: {
  loan: LoanView;
  onRecord: (kind: LoanRecordKind) => void;
  onArchived: () => void;
}) {
  const { today, reload } = useAppData();
  const { busy, run, message } = useTask();
  const [name, setName] = useState(loan.item.name);
  const [subtype, setSubtype] = useState(loan.item.subtype ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const { current, rate, balance, next, schedule } = summarizeLoan(loan, today);
  const foreign = foreignOf(loan);
  const dirty = name.trim() !== loan.item.name || (subtype || null) !== (loan.item.subtype ?? null);

  const saveInfo = () => {
    const trimmed = name.trim();
    if (!trimmed) return setNameError('請輸入名稱');
    if (trimmed.length > NAME_MAX_LENGTH) return setNameError(`名稱最多 ${NAME_MAX_LENGTH} 字`);
    setNameError(null);
    run(async () => {
      await api.renameItem(loan.item.id, trimmed, subtype || null);
      await reload();
    });
  };

  const archive = () => {
    if (!window.confirm(`封存「${loan.item.name}」？封存後不計入總額，之後可在設定頁恢復。`)) return;
    run(async () => {
      await api.setArchived(loan.item.id, true);
      onArchived();
      await reload();
    });
  };

  return (
    <div className="form">
      {message && <TaskNotice message={message} />}

      <section className="list-group">
        <h3 className="list-group__label">貸款資訊</h3>
        <div className="list">
          <label className="list-row list-row--field">
            <span className="list-row__label">名稱</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX_LENGTH} />
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
          <div className="list-row">
            <span className="list-row__main">幣別</span>
            <span className="list-row__detail">{loan.currency}</span>
          </div>
          <div className="list-row">
            <span className="list-row__main">剩餘本金</span>
            <Amount value={balance} currency={foreign} className="list-row__detail" />
          </div>
        </div>
        {nameError && <p className="field__error">{nameError}</p>}
        {dirty && (
          <button type="button" className="btn btn--primary list-group__button" disabled={busy} onClick={saveInfo}>
            儲存名稱與類型
          </button>
        )}
      </section>

      <section className="list-group">
        <h3 className="list-group__label">還款計畫</h3>
        <div className="list">
          <button type="button" className="list-row list-row--button" onClick={() => onRecord('mode')}>
            <span className="list-row__main">還款方式</span>
            <span className="list-row__detail">{current ? describeMode(current) : '—'}</span>
            <span className="list-row__chevron">
              <ChevronRightIcon size={16} />
            </span>
          </button>
          <button type="button" className="list-row list-row--button" onClick={() => onRecord('rate')}>
            <span className="list-row__main">年利率</span>
            <span className="list-row__detail">{toFixedString(rate, 3).replace(/\.?0+$/, '')}%</span>
            <span className="list-row__chevron">
              <ChevronRightIcon size={16} />
            </span>
          </button>
          <div className="list-row">
            <span className="list-row__main">每月扣款日</span>
            <span className="list-row__detail">每月 {Number(loan.firstPaymentDate.slice(8, 10))} 日</span>
          </div>
          <div className="list-row">
            <span className="list-row__main">起算</span>
            <span className="list-row__detail">
              {formatDate(loan.startDate)}・<Amount value={dec(loan.principal)} currency={foreign} />
            </span>
          </div>
          {schedule.paidOffAt && (
            <div className="list-row">
              <span className="list-row__main">預計還清</span>
              <span className="list-row__detail">{formatDate(schedule.paidOffAt)}</span>
            </div>
          )}
        </div>
        <p className="list-group__note">
          改還款方式或利率時，會從你選的日期開始套用，之前的扣款不受影響（例如學貸展延、升息）。
        </p>
      </section>

      <section className="list-group">
        <h3 className="list-group__label">下期扣款預估{next && ` · ${formatDate(next.date, today)}`}</h3>
        {next ? (
          <div className="estimate">
            <div>
              <span>總應繳</span>
              <Amount value={next.payment} currency={foreign} className="estimate__value" />
            </div>
            <div>
              <span>還本金</span>
              <Amount value={next.principal} currency={foreign} className="estimate__value" />
            </div>
            <div>
              <span>繳利息</span>
              <Amount value={next.interest} currency={foreign} className="estimate__value" />
            </div>
          </div>
        ) : (
          <p className="list-group__note">
            {current?.mode === 'defer_all' ? '緩繳中，目前不用繳款。' : '沒有下一期扣款。'}
          </p>
        )}
      </section>

      <section className="list-group">
        <div className="list">
          <button
            type="button"
            className="list-row list-row--button list-row--accent"
            onClick={() => onRecord('balance')}
          >
            校正餘額（和銀行對帳）
          </button>
          <button
            type="button"
            className="list-row list-row--button list-row--danger"
            disabled={busy}
            onClick={archive}
          >
            封存這筆貸款
          </button>
        </div>
      </section>
    </div>
  );
}

interface HistoryEvent {
  key: string;
  date: string;
  badge: string;
  title: string;
  detail: string;
  amount?: { value: ReturnType<typeof dec>; sign: '+' | '−' | '' };
  remove?: { table: api.LoanRecordTable; id: string };
}

function LoanHistory({ loan }: { loan: LoanView }) {
  const { reload } = useAppData();
  const { busy, run, message } = useTask();
  const foreign = foreignOf(loan);
  const byDate = <T,>(list: T[], key: (t: T) => string) => [...list].sort((a, b) => key(a).localeCompare(key(b)));
  const [firstMode, ...laterModes] = byDate(loan.records.modes, (m) => m.effective_date);
  const [firstRate, ...laterRates] = byDate(loan.records.rates, (r) => r.effective_date);

  const events: HistoryEvent[] = [
    {
      key: 'start',
      date: loan.startDate,
      badge: '新',
      title: '新增貸款',
      detail: [
        firstMode &&
          describeMode({
            mode: firstMode.mode,
            termMonths: firstMode.term_months,
            interestEvery: firstMode.interest_every,
          }),
        firstRate && `年利率 ${rateText(firstRate.annual_rate)}`,
      ]
        .filter(Boolean)
        .join('・'),
      amount: { value: dec(loan.principal), sign: '+' as const },
    },
    ...laterModes.map((m) => ({
      key: m.id,
      date: m.effective_date,
      badge: '換',
      title: '切換還款方式',
      detail: describeMode({ mode: m.mode, termMonths: m.term_months, interestEvery: m.interest_every }),
      remove: { table: 'loan_mode_changes' as const, id: m.id },
    })),
    ...laterRates.map((r) => ({
      key: r.id,
      date: r.effective_date,
      badge: '率',
      title: '利率變動',
      detail: `年利率 ${rateText(r.annual_rate)}`,
      remove: { table: 'loan_rate_changes' as const, id: r.id },
    })),
    ...loan.records.adjustments.map((a) => ({
      key: a.id,
      date: a.adjust_date,
      badge: a.kind === 'prepayment' ? '還' : '校',
      title: a.kind === 'prepayment' ? '提前還款' : '校正餘額',
      detail:
        a.kind === 'prepayment'
          ? a.keep === 'term'
            ? '期數不變，降低每期金額'
            : '每期金額不變，提早還清'
          : '剩餘本金改為',
      amount: { value: dec(a.amount), sign: a.kind === 'prepayment' ? ('−' as const) : ('' as const) },
      remove: { table: 'loan_adjustments' as const, id: a.id },
    })),
  ].sort((a, b) => (a.key === 'start' ? 1 : b.key === 'start' ? -1 : b.date.localeCompare(a.date)));

  const remove = (event: HistoryEvent) => {
    if (!event.remove) return;
    const { table, id } = event.remove;
    if (!window.confirm(`刪除「${longDate(event.date)} ${event.title}」？還款表會重新計算。`)) return;
    run(async () => {
      await api.deleteLoanRecord(table, id);
      await reload();
    });
  };

  return (
    <>
      {message && <TaskNotice message={message} />}
      <ul className="history">
        {events.map((e) => (
          <li key={e.key} className="history__item">
            <span className={`history__badge history__badge--${e.key === 'start' ? 'start' : 'change'}`}>
              {e.badge}
            </span>
            <span className="history__main">
              <strong>{e.title}</strong>
              <span className="history__sub">
                {longDate(e.date)}
                {e.detail && `・${e.detail}`}
              </span>
            </span>
            <span className="history__side">
              {e.amount && (
                <span className="history__amount">
                  {e.amount.sign}
                  <Amount value={e.amount.value} currency={foreign} />
                </span>
              )}
              {e.remove && (
                <button
                  type="button"
                  className="text-button text-button--danger"
                  disabled={busy}
                  onClick={() => remove(e)}
                >
                  刪除
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="footnote">每月依排程的扣款由還款表自動計算，不會列在這裡；要看每一期，點卡片上的「還款」。</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// 還款試算表
// ---------------------------------------------------------------------------

type RepayMode = 'full' | 'partial' | 'schedule';

export function RepaySheet({ loanId, onClose }: { loanId: string; onClose: () => void }) {
  const { loans, today, reload } = useAppData();
  const [mode, setMode] = useState<RepayMode>('schedule');
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [keep, setKeep] = useState<'term' | 'payment'>('term');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const loan = loans.find((l) => l.id === loanId);
  if (!loan) return null;

  const summary = summarizeLoan(loan, today);
  const foreign = foreignOf(loan);
  const validDate = isIsoDate(date) && date > loan.startDate;
  const balanceOnDate = validDate ? loanBalanceOn(loan, date) : null;
  const parsed = parseAmountInput(amount);
  const partialValue = parsed.ok ? dec(parsed.value) : null;

  const confirm = async (close: () => void) => {
    if (!validDate || balanceOnDate === null) return setError('還款日要在起算日之後');
    if (balanceOnDate === ZERO) return setError('這天已經沒有剩餘本金');
    let pay: string;
    if (mode === 'full') {
      if (!window.confirm(`記錄 ${formatDate(date)} 全額還清？`)) return;
      pay = toFixedString(balanceOnDate, 4);
    } else {
      if (!parsed.ok) return setError(parsed.error);
      if (partialValue === null || partialValue <= ZERO) return setError('金額要大於 0');
      if (partialValue >= balanceOnDate) return setError('金額超過剩餘本金，請改用「全額還款」');
      pay = parsed.value;
    }
    setError(null);
    setSaving(true);
    try {
      await api.addAdjustment(loan.id, {
        date,
        kind: 'prepayment',
        amount: pay,
        keep: mode === 'full' ? 'term' : keep,
      });
      await reload();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title="還款試算表"
      onClose={onClose}
      action={(close) =>
        mode !== 'schedule' && (
          <button
            type="button"
            className="text-button text-button--strong"
            disabled={saving}
            onClick={() => confirm(close)}
          >
            確認還款
          </button>
        )
      }
    >
      {() => (
        <>
          <header className="repay-head">
            <strong>{loan.item.name}</strong>
            <span>
              剩餘本金 <Amount value={summary.balance} currency={foreign} />
            </span>
          </header>

          <div className="segmented segmented--three" role="group" aria-label="還款方式">
            {(
              [
                ['full', '全額還款'],
                ['partial', '部分還款'],
                ['schedule', '依排程'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={mode === key}
                onClick={() => {
                  setMode(key);
                  setError(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'schedule' ? (
            <ScheduleByYear loan={loan} rows={summary.schedule.rows} openEnded={summary.openEnded} />
          ) : (
            <div className="form repay-form">
              <div className="list-group">
                <div className="list">
                  <label className="list-row list-row--field">
                    <span className="list-row__label">還款日</span>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </label>
                  {mode === 'full' ? (
                    <div className="list-row">
                      <span className="list-row__main">還清金額</span>
                      <Amount value={balanceOnDate} currency={foreign} className="list-row__value" />
                    </div>
                  ) : (
                    <label className="list-row list-row--field">
                      <span className="list-row__label">多還的本金</span>
                      <input
                        className="amount-input"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0"
                      />
                    </label>
                  )}
                </div>
                <p className="list-group__note">
                  {mode === 'full'
                    ? '這天扣完當期後剩下的本金，一次還清。記錄後首頁的負債會變成 0。'
                    : '多還的金額直接扣在本金上，之後的還款表會重新計算。'}
                </p>
              </div>

              {mode === 'partial' && (
                <>
                  <div className="segmented" role="group" aria-label="提前還款後">
                    <button type="button" aria-pressed={keep === 'term'} onClick={() => setKeep('term')}>
                      降低每期金額
                    </button>
                    <button type="button" aria-pressed={keep === 'payment'} onClick={() => setKeep('payment')}>
                      縮短還款期間
                    </button>
                  </div>
                  {balanceOnDate !== null &&
                    partialValue !== null &&
                    partialValue > ZERO &&
                    partialValue < balanceOnDate && (
                      <p className="list-group__note">
                        還款後剩餘本金 <Amount value={balanceOnDate - partialValue} currency={foreign} />
                      </p>
                    )}
                </>
              )}
            </div>
          )}

          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}

function ScheduleByYear({ loan, rows, openEnded }: { loan: LoanView; rows: ScheduleRow[]; openEnded: boolean }) {
  const { today } = useAppData();
  const foreign = foreignOf(loan);
  const nextIndex = rows.findIndex((r) => r.type === 'payment' && r.date > today);
  const focusYear = (rows[nextIndex]?.date ?? today).slice(0, 4);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set([focusYear]));

  if (rows.length === 0) {
    return (
      <p className="page-message">目前沒有任何扣款（緩繳本息期間不用繳錢）。開始繳款時，到「編輯」切換還款方式。</p>
    );
  }

  const years = new Map<string, { row: ScheduleRow; index: number }[]>();
  rows.forEach((row, index) => {
    const year = row.date.slice(0, 4);
    years.set(year, [...(years.get(year) ?? []), { row, index }]);
  });

  const future = rows.filter((r) => r.type === 'payment' && r.date > today);
  const sum = (pick: (r: ScheduleRow) => bigint) => future.reduce((t, r) => t + pick(r), ZERO);

  const toggle = (year: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });

  const tag = (row: ScheduleRow, index: number): ReactNode => {
    if (row.type === 'prepayment') return <span className="tag tag--accent">提前還款</span>;
    if (row.type === 'balance') return <span className="tag tag--accent">校正餘額</span>;
    if (row.date <= today) return <span className="tag tag--done">已扣款</span>;
    if (index === nextIndex) return <span className="tag tag--next">下一期</span>;
    return <span className="tag">未到期</span>;
  };

  return (
    <>
      <p className="repay-info">
        每月扣款會依還款表自動從本金扣除，不用手動確認；有提前還款時改選上方的「全額」或「部分還款」。
      </p>
      <div className="years">
        {[...years.entries()].map(([year, list]) => {
          const payments = list.filter(({ row }) => row.type === 'payment').length;
          const expanded = open.has(year);
          return (
            <section key={year} className={`year ${expanded ? 'year--open' : ''}`}>
              <button type="button" className="year__head" aria-expanded={expanded} onClick={() => toggle(year)}>
                <span className="year__chevron" aria-hidden="true">
                  <ChevronRightIcon size={18} />
                </span>
                <span className="year__label">{year}</span>
                <span className="year__count">共 {payments} 期</span>
              </button>
              {expanded && (
                <ol className="year__rows">
                  {list.map(({ row, index }) => {
                    const past = row.date <= today;
                    return (
                      <li key={`${row.date}-${row.type}-${index}`} className={`period ${past ? 'period--past' : ''}`}>
                        <span className="period__mark" aria-hidden="true">
                          {past && <CheckIcon size={14} />}
                        </span>
                        <span className="period__main">
                          <span className="period__date">
                            {formatDate(row.date)}
                            {tag(row, index)}
                          </span>
                          {row.type === 'payment' ? (
                            <span className="period__detail">
                              <span>
                                本金 <Amount value={row.principal} currency={foreign} />
                              </span>
                              <span>
                                利息 <Amount value={row.interest} currency={foreign} />
                              </span>
                            </span>
                          ) : (
                            <span className="period__detail">
                              餘 <Amount value={row.balance} currency={foreign} />
                            </span>
                          )}
                        </span>
                        <Amount
                          value={row.type === 'balance' ? row.balance : row.payment}
                          currency={foreign}
                          className="period__amount"
                        />
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
      </div>

      <dl className="totals">
        <div>
          <dt>未來總應繳</dt>
          <dd>
            <Amount value={sum((r) => r.payment)} currency={foreign} />
          </dd>
        </div>
        <div>
          <dt>其中本金</dt>
          <dd>
            <Amount value={sum((r) => r.principal)} currency={foreign} />
          </dd>
        </div>
        <div>
          <dt>其中利息</dt>
          <dd>
            <Amount value={sum((r) => r.interest)} currency={foreign} />
          </dd>
        </div>
      </dl>
      {openEnded && <p className="footnote">目前沒有到期日，只列到一年後。</p>}
      <p className="footnote">
        每期利息 = 期初本金 × 年利率 ÷ 12；不滿一個月的期間按日計息。金額四捨五入到元，最後一期把零頭一次還清。
      </p>
    </>
  );
}
