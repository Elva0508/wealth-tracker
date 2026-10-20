/**
 * 貸款第三層：逐期還款表。已扣款的期數變淡，打開時捲到下一期。
 * 一直緩繳或只繳息時（沒有到期日），只列到一年後。
 */
import { REPAYMENT_MODE_LABELS, type ScheduleRow } from '@core';
import { useLayoutEffect, useRef } from 'react';
import { Navigate, useParams } from 'react-router';
import { Amount } from '../components/Amount';
import { Page } from '../components/Page';
import { useAppData } from '../hooks/useAppData';
import { formatDate } from '../lib/constants';
import { summarizeLoan } from '../lib/loanSummary';

const ROW_LABELS: Record<ScheduleRow['type'], string> = {
  payment: '',
  prepayment: '提前還款',
  balance: '校正餘額',
};

export function LoanSchedulePage() {
  const { loanId } = useParams();
  const { loans, today, loading } = useAppData();
  const nextRef = useRef<HTMLLIElement>(null);
  const loan = loans.find((l) => l.id === loanId);

  // 打開時把下一期捲到畫面上方附近
  useLayoutEffect(() => {
    const row = nextRef.current;
    const layer = row?.closest('.layer');
    if (row && layer) layer.scrollTop = Math.max(0, row.offsetTop - 160);
  }, [loanId]);

  if (loading) return <p className="page-message">載入中…</p>;
  if (!loan) return <Navigate to="/loans" replace />;

  const { schedule, openEnded } = summarizeLoan(loan, today);
  const foreign = loan.currency !== 'TWD' ? loan.currency : undefined;
  const nextIndex = schedule.rows.findIndex((r) => r.date > today);
  let lastMode: string | null = null;

  return (
    <Page title="還款表" backHref={`/loans/${loan.id}`} backText="返回">
      {schedule.rows.length === 0 ? (
        <p className="page-message">目前沒有任何扣款（緩繳本息期間不用繳錢）。開始繳款時，到上一頁切換還款方式。</p>
      ) : (
        <ol className="schedule">
          {schedule.rows.map((row, i) => {
            // 還款方式改變的地方加一行標題
            const header = row.type === 'payment' && row.mode !== lastMode ? row.mode : null;
            if (row.type === 'payment') lastMode = row.mode;
            const past = row.date <= today;
            return (
              <li
                key={`${row.date}-${row.type}-${i}`}
                ref={i === nextIndex ? nextRef : undefined}
                className={`schedule__row ${past ? 'schedule__row--past' : ''} ${i === nextIndex ? 'schedule__row--next' : ''}`}
              >
                {header && <p className="schedule__mode">{REPAYMENT_MODE_LABELS[header]}</p>}
                <div className="schedule__line">
                  <span className="schedule__date">
                    {formatDate(row.date)}
                    <span className="schedule__period">
                      {row.type === 'payment'
                        ? row.periodsInMode
                          ? `第 ${row.period}/${row.periodsInMode} 期`
                          : `第 ${row.period} 期`
                        : ROW_LABELS[row.type]}
                    </span>
                  </span>
                  <span className="schedule__payment">
                    <Amount value={row.type === 'balance' ? row.balance : row.payment} currency={foreign} />
                  </span>
                </div>
                <div className="schedule__detail">
                  {row.type === 'payment' ? (
                    <>
                      <span>
                        本金 <Amount value={row.principal} currency={foreign} />
                      </span>
                      <span>
                        利息 <Amount value={row.interest} currency={foreign} />
                      </span>
                    </>
                  ) : (
                    <span />
                  )}
                  <span>
                    餘 <Amount value={row.balance} currency={foreign} />
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {openEnded && schedule.rows.length > 0 && <p className="footnote">目前沒有到期日，只列到一年後。</p>}
      <p className="footnote">
        每期利息 = 期初本金 × 年利率 ÷
        12；不滿一個月的期間按日計息。金額四捨五入到元，最後一期把零頭一次還清。和銀行對帳單有差距時，可以在上一頁校正餘額。
      </p>
    </Page>
  );
}
