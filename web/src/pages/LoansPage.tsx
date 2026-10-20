/** 貸款管理第一層：所有貸款與剩餘本金合計，點進去看還款資料 */
import { ZERO, dec, summarize } from '@core';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Amount } from '../components/Amount';
import { ChevronRightIcon, PlusIcon } from '../components/Icons';
import { LoanForm } from '../components/LoanForm';
import { describeMode } from '../components/ModeFields';
import { Page } from '../components/Page';
import { Sheet } from '../components/Sheet';
import { useAppData } from '../hooks/useAppData';
import { formatDate } from '../lib/constants';
import { summarizeLoan } from '../lib/loanSummary';

export function LoansPage() {
  const { loans, items, rates, today, loading, error } = useAppData();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  // 新增完先讓面板滑下去，再進到新貸款的頁面
  const openAfterClose = useRef<string | null>(null);
  const closeSheet = () => {
    setCreating(false);
    setConverting(null);
    if (openAfterClose.current) navigate(`/loans/${openAfterClose.current}`);
    openAfterClose.current = null;
  };
  const [converting, setConverting] = useState<(typeof items)[number] | null>(null);

  const active = useMemo(
    () =>
      loans
        .filter((l) => l.item.status === 'active')
        .sort((a, b) => a.item.sortOrder - b.item.sortOrder)
        .map((loan) => ({ loan, summary: summarizeLoan(loan, today) })),
    [loans, today],
  );
  // 合計用首頁同一套換算（外幣貸款換成新台幣）
  const total = useMemo(() => summarize(items, rates).categories.loan.total, [items, rates]);
  const manualLoans = items.filter((i) => i.category === 'loan' && i.status === 'active' && i.sourceType !== 'loan');

  return (
    <Page
      title="貸款管理"
      largeTitle
      end={
        <button type="button" className="icon-button" aria-label="新增貸款" onClick={() => setCreating(true)}>
          <PlusIcon size={22} />
        </button>
      }
    >
      {loading ? (
        <p className="page-message">載入中…</p>
      ) : error ? (
        <p className="page-message" role="alert">
          讀取資料失敗：{error}
        </p>
      ) : (
        <>
          <header className="sub-hero">
            <span className="sub-hero__label">貸款剩餘本金合計（含手動輸入）</span>
            <Amount value={total} className="sub-hero__value" />
          </header>

          {active.length === 0 ? (
            <div className="empty">
              <p>還沒有自動計算的貸款。</p>
              <p className="muted small">
                輸入利率、還款方式與期數，每月扣款後餘額會自動減少，首頁的負債也會跟著更新。
              </p>
              <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
                新增貸款
              </button>
            </div>
          ) : (
            <section className="list-group">
              <div className="list">
                {active.map(({ loan, summary }) => (
                  <button
                    key={loan.id}
                    type="button"
                    className="list-row list-row--button"
                    onClick={() => navigate(`/loans/${loan.id}`)}
                  >
                    <span className="list-row__main">
                      <span className="list-row__name">{loan.item.name}</span>
                      <span className="list-row__sub">
                        {summary.current ? describeMode(summary.current) : '—'}
                        {summary.next && (
                          <>
                            {' · '}
                            {formatDate(summary.next.date, today)} 扣 <Amount value={summary.next.payment} />
                          </>
                        )}
                      </span>
                    </span>
                    <Amount value={summary.balance} className="list-row__value" />
                    <span className="list-row__chevron">
                      <ChevronRightIcon size={16} />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {manualLoans.length > 0 && (
            <section className="list-group">
              <h2 className="list-group__label">手動輸入的貸款</h2>
              <div className="list">
                {manualLoans.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="list-row list-row--button"
                    onClick={() => setConverting(item)}
                  >
                    <span className="list-row__main">
                      <span className="list-row__name">{item.name}</span>
                      <span className="list-row__sub">點一下轉成自動計算</span>
                    </span>
                    <Amount value={dec(item.amount)} className="list-row__value" />
                    <span className="list-row__chevron">
                      <ChevronRightIcon size={16} />
                    </span>
                  </button>
                ))}
              </div>
              <p className="list-group__note">這些是在資產總覽手動輸入金額的貸款，轉換後會保留原本的紀錄與快照。</p>
            </section>
          )}
          {total === ZERO && active.length > 0 && <p className="footnote">所有貸款都已還清。</p>}
        </>
      )}

      {converting && (
        <Sheet title="轉成自動計算" onClose={closeSheet}>
          {(close) => (
            <LoanForm
              convert={converting}
              onSaved={(loanId) => {
                openAfterClose.current = loanId;
                close();
              }}
            />
          )}
        </Sheet>
      )}

      {creating && (
        <Sheet title="新增貸款" onClose={closeSheet}>
          {(close) => (
            <LoanForm
              onSaved={(loanId) => {
                openAfterClose.current = loanId;
                close();
              }}
            />
          )}
        </Sheet>
      )}
    </Page>
  );
}
