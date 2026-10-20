/**
 * 貸款第二層：剩餘本金、目前的還款方式與利率、下一期扣款，
 * 以及還款方式／利率／提前還款的紀錄。還款表在下一層。
 */
import { REPAYMENT_MODE_LABELS, dec, toFixedString } from '@core';
import { type ReactNode, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Amount } from '../components/Amount';
import { ChevronRightIcon } from '../components/Icons';
import { type LoanRecordKind, LoanRecordForm, RECORD_TITLES } from '../components/LoanRecordForm';
import { describeMode } from '../components/ModeFields';
import { Page } from '../components/Page';
import { Sheet } from '../components/Sheet';
import { TaskNotice } from '../components/TaskNotice';
import { useAppData } from '../hooks/useAppData';
import { useTask } from '../hooks/useTask';
import * as api from '../lib/api';
import { formatDate } from '../lib/constants';
import { summarizeLoan } from '../lib/loanSummary';
import { goBack } from '../lib/navigation';

export function LoanPage() {
  const { loanId } = useParams();
  const { loans, today, loading, reload } = useAppData();
  const navigate = useNavigate();
  const { busy, run, message } = useTask();
  const [editing, setEditing] = useState<LoanRecordKind | null>(null);

  const loan = loans.find((l) => l.id === loanId);
  if (loading) return <p className="page-message">載入中…</p>;
  if (!loan || loan.item.status !== 'active') return <Navigate to="/loans" replace />;

  const summary = summarizeLoan(loan, today);
  const { current, next, schedule } = summary;
  const foreign = loan.currency !== 'TWD' ? loan.currency : undefined;
  const sortedDesc = <T,>(list: T[], key: (t: T) => string) => [...list].sort((a, b) => key(b).localeCompare(key(a)));

  const remove = (table: api.LoanRecordTable, id: string, label: string) => {
    if (!window.confirm(`刪除「${label}」這筆紀錄？還款表會重新計算。`)) return;
    run(async () => {
      await api.deleteLoanRecord(table, id);
      await reload();
    });
  };

  const archive = () => {
    if (!window.confirm(`封存「${loan.item.name}」？封存後不計入總額，之後可在設定頁恢復。`)) return;
    run(async () => {
      await api.setArchived(loan.item.id, true);
      goBack(navigate, '/loans');
      await reload();
    });
  };

  // 最早那一筆是起算時的設定，不能刪除
  const firstModeId = [...loan.records.modes].sort((a, b) => a.effective_date.localeCompare(b.effective_date))[0]?.id;
  const firstRateId = [...loan.records.rates].sort((a, b) => a.effective_date.localeCompare(b.effective_date))[0]?.id;

  return (
    <Page title={loan.item.name} backHref="/loans" backText="貸款">
      {message && <TaskNotice message={message} />}

      <header className="sub-hero">
        <span className="sub-hero__label">剩餘本金 · {formatDate(today)}</span>
        <Amount value={summary.balance} currency={foreign} className="sub-hero__value" />
      </header>

      <section className="list-group">
        <div className="list">
          <div className="list-row">
            <span className="list-row__main">目前還款方式</span>
            <span className="list-row__detail">{current ? describeMode(current) : '—'}</span>
          </div>
          <div className="list-row">
            <span className="list-row__main">年利率</span>
            <span className="list-row__detail">{toFixedString(summary.rate, 3).replace(/\.?0+$/, '')}%</span>
          </div>
          <div className="list-row">
            <span className="list-row__main">下一期扣款</span>
            <span className="list-row__detail">
              {next ? (
                <>
                  {formatDate(next.date, today)}・<Amount value={next.payment} currency={foreign} />
                </>
              ) : current?.mode === 'defer_all' ? (
                '緩繳中，不用繳款'
              ) : (
                '—'
              )}
            </span>
          </div>
          {schedule.paidOffAt && (
            <div className="list-row">
              <span className="list-row__main">預計還清</span>
              <span className="list-row__detail">{formatDate(schedule.paidOffAt)}</span>
            </div>
          )}
          <button
            type="button"
            className="list-row list-row--button"
            onClick={() => navigate(`/loans/${loan.id}/schedule`)}
          >
            <span className="list-row__main">還款表</span>
            <span className="list-row__chevron">
              <ChevronRightIcon size={16} />
            </span>
          </button>
        </div>
        {summary.openEnded && (
          <p className="list-group__note">
            目前是{current ? REPAYMENT_MODE_LABELS[current.mode] : '緩繳'}，還沒有到期日；開始攤還時再切換還款方式。
          </p>
        )}
      </section>

      <section className="list-group">
        <h2 className="list-group__label">還款方式</h2>
        <div className="list">
          {sortedDesc(loan.records.modes, (m) => m.effective_date).map((m) => (
            <RecordRow
              key={m.id}
              date={m.effective_date}
              label={describeMode({ mode: m.mode, termMonths: m.term_months, interestEvery: m.interest_every })}
              onDelete={
                m.id === firstModeId
                  ? undefined
                  : () => remove('loan_mode_changes', m.id, `${formatDate(m.effective_date)} 起`)
              }
              disabled={busy}
            />
          ))}
          <button
            type="button"
            className="list-row list-row--button list-row--accent"
            onClick={() => setEditing('mode')}
          >
            切換還款方式（展延、開始攤還…）
          </button>
        </div>
      </section>

      <section className="list-group">
        <h2 className="list-group__label">利率</h2>
        <div className="list">
          {sortedDesc(loan.records.rates, (r) => r.effective_date).map((r) => (
            <RecordRow
              key={r.id}
              date={r.effective_date}
              label={`${Number(r.annual_rate)}%`}
              onDelete={
                r.id === firstRateId
                  ? undefined
                  : () => remove('loan_rate_changes', r.id, `${formatDate(r.effective_date)} 起`)
              }
              disabled={busy}
            />
          ))}
          <button
            type="button"
            className="list-row list-row--button list-row--accent"
            onClick={() => setEditing('rate')}
          >
            記錄利率變動
          </button>
        </div>
      </section>

      <section className="list-group">
        <h2 className="list-group__label">提前還款與校正</h2>
        <div className="list">
          {sortedDesc(loan.records.adjustments, (a) => a.adjust_date).map((a) => (
            <RecordRow
              key={a.id}
              date={a.adjust_date}
              label={
                <>
                  {a.kind === 'prepayment' ? '提前還款 ' : '校正為 '}
                  <Amount value={dec(a.amount)} currency={foreign} />
                  {a.kind === 'prepayment' && (a.keep === 'term' ? '・降低月付' : '・縮短期間')}
                </>
              }
              suffix=""
              onDelete={() =>
                remove(
                  'loan_adjustments',
                  a.id,
                  `${formatDate(a.adjust_date)} ${a.kind === 'prepayment' ? '提前還款' : '校正餘額'}`,
                )
              }
              disabled={busy}
            />
          ))}
          <button
            type="button"
            className="list-row list-row--button list-row--accent"
            onClick={() => setEditing('prepayment')}
          >
            提前還款
          </button>
          <button
            type="button"
            className="list-row list-row--button list-row--accent"
            onClick={() => setEditing('balance')}
          >
            校正餘額（和銀行對帳）
          </button>
        </div>
      </section>

      <section className="list-group">
        <div className="list">
          <button
            type="button"
            className="list-row list-row--button list-row--danger"
            onClick={archive}
            disabled={busy}
          >
            封存這筆貸款
          </button>
        </div>
        <p className="list-group__note">
          起算日 {formatDate(loan.startDate)}，起算本金 <Amount value={dec(loan.principal)} currency={foreign} />
          ，每月 {Number(loan.firstPaymentDate.slice(8, 10))} 號扣款。
        </p>
      </section>

      {editing && (
        <Sheet title={RECORD_TITLES[editing]} onClose={() => setEditing(null)}>
          {(close) => <LoanRecordForm loan={loan} kind={editing} onSaved={close} />}
        </Sheet>
      )}
    </Page>
  );
}

function RecordRow({
  date,
  label,
  suffix = ' 起',
  onDelete,
  disabled,
}: {
  date: string;
  label: ReactNode;
  suffix?: string;
  onDelete?: () => void;
  disabled: boolean;
}) {
  return (
    <div className="list-row">
      <span className="list-row__main">
        <span>{label}</span>
        <span className="list-row__sub">
          {formatDate(date)}
          {suffix}
        </span>
      </span>
      {onDelete && (
        <button type="button" className="text-button text-button--danger" onClick={onDelete} disabled={disabled}>
          刪除
        </button>
      )}
    </div>
  );
}
