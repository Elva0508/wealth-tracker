/**
 * 貸款分頁：總貸款卡片＋每筆貸款一張卡片。
 * - 點卡片：編輯／紀錄面板
 * - 點卡片上的「還款」：還款試算表
 * - 新增只有一個入口：畫面中下方的 +
 */
import { type Dec, ZERO, dec, percentOf, summarize } from '@core';
import { useMemo, useState } from 'react';
import { Amount } from '../components/Amount';
import { CalendarIcon, CategoryIcon, ChevronRightIcon, PlusIcon } from '../components/Icons';
import { LoanForm } from '../components/LoanForm';
import { LoanDetailSheet, RepaySheet } from '../components/LoanSheets';
import { describeMode } from '../components/ModeFields';
import { Page } from '../components/Page';
import { Sheet } from '../components/Sheet';
import { type LoanView, useAppData } from '../hooks/useAppData';
import type * as api from '../lib/api';
import { formatDate } from '../lib/constants';
import { summarizeLoan } from '../lib/loanSummary';

/** 各筆貸款在比例條上的顏色，依序循環 */
const LOAN_COLORS = ['#a2553a', '#e0a07a', '#6f4f73', '#8f8a5a', '#c48a5a', '#6a8eab'];

type Open = { kind: 'create' } | { kind: 'convert'; item: api.Item } | { kind: 'detail' | 'repay'; loanId: string };

export function LoansPage() {
  const { loans, items, rates, today, loading, error } = useAppData();
  const [open, setOpen] = useState<Open | null>(null);
  const close = () => setOpen(null);

  const active = useMemo(
    () =>
      loans
        .filter((l) => l.item.status === 'active')
        .sort((a, b) => a.item.sortOrder - b.item.sortOrder)
        .map((loan) => ({ loan, summary: summarizeLoan(loan, today) })),
    [loans, today],
  );
  const manual = items.filter((i) => i.category === 'loan' && i.status === 'active' && i.sourceType !== 'loan');

  // 合計與比例用首頁同一套換算（外幣貸款換成新台幣）
  const summary = useMemo(() => summarize(items, rates), [items, rates]);
  const total = summary.categories.loan.total;
  const shares = summary.items
    .filter((i) => i.category === 'loan' && i.amountBase !== null && i.amountBase > ZERO)
    .map((i, index) => ({
      id: i.id,
      name: i.name,
      color: LOAN_COLORS[index % LOAN_COLORS.length],
      percent: percentOf(i.amountBase!, total),
    }));
  const count = active.length + manual.length;

  return (
    <Page title="我的貸款" largeTitle>
      {loading ? (
        <p className="page-message">載入中…</p>
      ) : error ? (
        <p className="page-message" role="alert">
          讀取資料失敗：{error}
        </p>
      ) : count === 0 ? (
        <div className="debt-empty">
          <span className="debt-empty__icon" aria-hidden="true">
            <CategoryIcon category="credit_card" size={64} />
          </span>
          <strong>享受無債一身輕</strong>
          <p>
            如果有貸款
            <br />
            點擊下方 + 新增以追蹤
          </p>
        </div>
      ) : (
        <>
          <section className="card debt-total" aria-label="總貸款">
            <div className="debt-total__head">
              <span className="muted">總貸款 ({summary.baseCurrency})</span>
              <span className="muted">{count} 筆</span>
            </div>
            <Amount value={total} className="debt-total__value" />
            {shares.length > 0 && (
              <>
                <div
                  className="debt-bar"
                  role="img"
                  aria-label={shares.map((s) => `${s.name} ${Math.round(s.percent)}%`).join('、')}
                >
                  {shares.map((s) => (
                    <span key={s.id} style={{ flexGrow: s.percent, background: s.color }} />
                  ))}
                </div>
                <ul className="debt-legend">
                  {shares.map((s) => (
                    <li key={s.id}>
                      <span className="debt-legend__dot" style={{ background: s.color }} />
                      {s.name} {Math.round(s.percent)}%
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {active.map(({ loan, summary: s }) => (
            <LoanCard
              key={loan.id}
              loan={loan}
              summary={s}
              today={today}
              onOpen={() => setOpen({ kind: 'detail', loanId: loan.id })}
              onRepay={() => setOpen({ kind: 'repay', loanId: loan.id })}
            />
          ))}

          {manual.map((item) => (
            <ManualCard key={item.id} item={item} onConvert={() => setOpen({ kind: 'convert', item })} />
          ))}
        </>
      )}

      {/* 留出中下方新增鍵的空間 */}
      <div className="fab-spacer" aria-hidden="true" />
      <button type="button" className="fab-center" aria-label="新增貸款" onClick={() => setOpen({ kind: 'create' })}>
        <PlusIcon size={28} />
      </button>

      {open?.kind === 'create' && (
        <Sheet title="新增貸款" onClose={close}>
          {(done) => <LoanForm onSaved={done} />}
        </Sheet>
      )}
      {open?.kind === 'convert' && (
        <Sheet title="轉成自動計算" onClose={close}>
          {(done) => <LoanForm convert={open.item} onSaved={done} />}
        </Sheet>
      )}
      {open?.kind === 'detail' && <LoanDetailSheet loanId={open.loanId} onClose={close} />}
      {open?.kind === 'repay' && <RepaySheet loanId={open.loanId} onClose={close} />}
    </Page>
  );
}

function LoanCard({
  loan,
  summary,
  today,
  onOpen,
  onRepay,
}: {
  loan: LoanView;
  summary: ReturnType<typeof summarizeLoan>;
  today: string;
  onOpen: () => void;
  onRepay: () => void;
}) {
  const { current, balance, next, schedule } = summary;
  const foreign = loan.currency !== 'TWD' ? loan.currency : undefined;
  const lastPaid = schedule.rows.filter((r) => r.type === 'payment' && r.date <= today).at(-1);
  const paidOff = schedule.paidOffAt !== null && schedule.paidOffAt <= today;

  const status = paidOff
    ? `已於 ${formatDate(schedule.paidOffAt!)} 還清`
    : [
        current?.mode === 'defer_all'
          ? '緩繳中・不用繳款'
          : lastPaid
            ? `上次 ${formatDate(lastPaid.date, today)} 已扣款`
            : '尚未還款',
        next && `下次 ${formatDate(next.date)}`,
      ]
        .filter(Boolean)
        .join('・');

  return (
    <article className="card debt-card">
      {/* 整張卡片可點；還款區塊是獨立的按鈕，點它不會打開編輯 */}
      <button type="button" className="debt-card__open" aria-label={`${loan.item.name}，編輯與紀錄`} onClick={onOpen} />
      <div className="debt-card__head">
        <span className="debt-card__title">
          <strong>{loan.item.name}</strong>
          <span className="muted small">{current ? describeMode(current) : '—'}</span>
        </span>
        <NegativeAmount value={balance} currency={foreign} />
      </div>
      <button type="button" className="repay-block" onClick={onRepay}>
        <CalendarIcon size={22} />
        <span className="repay-block__text">
          <strong>還款</strong>
          <span>{status}</span>
        </span>
        <ChevronRightIcon size={18} />
      </button>
      <p className="debt-card__foot">
        <CalendarIcon size={16} />
        每月 {Number(loan.firstPaymentDate.slice(8, 10))} 日為還款日
      </p>
    </article>
  );
}

function ManualCard({ item, onConvert }: { item: api.Item; onConvert: () => void }) {
  return (
    <article className="card debt-card">
      <div className="debt-card__head">
        <span className="debt-card__title">
          <strong>{item.name}</strong>
          <span className="muted small">手動輸入餘額</span>
        </span>
        <NegativeAmount value={dec(item.amount)} currency={item.currency !== 'TWD' ? item.currency : undefined} />
      </div>
      <button type="button" className="repay-block" onClick={onConvert}>
        <CalendarIcon size={22} />
        <span className="repay-block__text">
          <strong>轉成自動計算還款</strong>
          <span>填入利率與期數，每月扣款後餘額自動減少</span>
        </span>
        <ChevronRightIcon size={18} />
      </button>
    </article>
  );
}

function NegativeAmount({ value, currency }: { value: Dec; currency?: string }) {
  return (
    <span className="debt-card__amount">
      {value > ZERO && '− '}
      <Amount value={value} currency={currency} />
    </span>
  );
}
