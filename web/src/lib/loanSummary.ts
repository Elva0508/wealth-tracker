/** 貸款畫面共用：目前的還款方式、利率、餘額、下一期扣款與還款表 */
import { type Loan, addDays, buildSchedule, loanBalanceOn, modeHasTerm, modeOn, rateOn } from '@core';

/** 有終點的還款方式一路算到還清；最後一筆是緩繳或只繳息時，算到一年後 */
const FAR_FUTURE = '2100-12-31';

export function summarizeLoan(loan: Loan, today: string) {
  const current = modeOn(loan, today);
  const lastMode = [...loan.modeChanges].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)).at(-1);
  const openEnded = !lastMode || !modeHasTerm(lastMode.mode);
  const horizon = openEnded
    ? addDays(lastMode && lastMode.effectiveDate > today ? lastMode.effectiveDate : today, 366)
    : FAR_FUTURE;
  const schedule = buildSchedule(loan, horizon);
  return {
    current,
    rate: rateOn(loan, today),
    balance: loanBalanceOn(loan, today),
    next: schedule.rows.find((r) => r.type === 'payment' && r.date > today) ?? null,
    schedule,
    /** 還款表沒有終點（目前一直緩繳或只繳息） */
    openEnded,
  };
}
