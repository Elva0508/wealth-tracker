/**
 * 第二層：編輯單一項目。
 * 自動計算的貸款不能直接改金額，這裡只顯示摘要，可打開貸款的編輯與還款試算表；
 * 手動輸入的貸款可以轉成自動計算。
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Amount } from '../components/Amount';
import { ItemForm } from '../components/ItemForm';
import { LoanForm } from '../components/LoanForm';
import { LoanDetailSheet, RepaySheet } from '../components/LoanSheets';
import { describeMode } from '../components/ModeFields';
import { Page } from '../components/Page';
import { Sheet } from '../components/Sheet';
import { useAppData } from '../hooks/useAppData';
import * as api from '../lib/api';
import { formatDate } from '../lib/constants';
import { summarizeLoan } from '../lib/loanSummary';
import { goBack } from '../lib/navigation';

export function ItemPage() {
  const { itemId } = useParams();
  const { items, loans, today, loading, reload } = useAppData();
  const navigate = useNavigate();
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [loanSheet, setLoanSheet] = useState<{ kind: 'detail' | 'repay'; loanId: string } | null>(null);

  const backHref = '/overview';
  const item = items.find((i) => i.id === itemId && i.status === 'active');

  const leave = () => goBack(navigate, backHref);

  function confirmArchive() {
    if (!item) return;
    if (!window.confirm(`封存「${item.name}」？封存後不計入總額，之後可在設定頁恢復。`)) return;
    api
      .setArchived(item.id, true)
      .then(() => {
        leave();
        return reload();
      })
      .catch((err) => setArchiveError(err instanceof Error ? err.message : String(err)));
  }

  return (
    <Page title={item?.name ?? '項目'} backHref={backHref} backText="總覽">
      {loading ? (
        <p className="page-message">載入中…</p>
      ) : !item ? (
        <p className="page-message">找不到這個項目，可能已經封存。</p>
      ) : item.sourceType === 'loan' ? (
        <LoanItemSummary
          loan={loans.find((l) => l.itemId === item.id)}
          today={today}
          onOpen={(kind, loanId) => setLoanSheet({ kind, loanId })}
        />
      ) : (
        <ItemForm
          key={item.id}
          item={item}
          onSaved={leave}
          footer={
            <>
              {archiveError && (
                <p className="field__error" role="alert">
                  封存失敗：{archiveError}
                </p>
              )}
              {item.category === 'loan' && (
                <button type="button" className="btn" onClick={() => setConverting(true)}>
                  轉成自動計算還款
                </button>
              )}
              <button type="button" className="btn btn--quiet" onClick={confirmArchive}>
                封存這個項目
              </button>
            </>
          }
        />
      )}

      {loanSheet?.kind === 'detail' && <LoanDetailSheet loanId={loanSheet.loanId} onClose={() => setLoanSheet(null)} />}
      {loanSheet?.kind === 'repay' && <RepaySheet loanId={loanSheet.loanId} onClose={() => setLoanSheet(null)} />}

      {converting && item && (
        <Sheet title="轉成自動計算" onClose={() => setConverting(false)}>
          {(close) => <LoanForm convert={item} onSaved={close} />}
        </Sheet>
      )}
    </Page>
  );
}

function LoanItemSummary({
  loan,
  today,
  onOpen,
}: {
  loan: ReturnType<typeof useAppData>['loans'][number] | undefined;
  today: string;
  onOpen: (kind: 'detail' | 'repay', loanId: string) => void;
}) {
  if (!loan) return <p className="page-message">讀取貸款資料中…</p>;
  const { current, balance, next } = summarizeLoan(loan, today);
  const foreign = loan.currency !== 'TWD' ? loan.currency : undefined;
  return (
    <>
      <header className="sub-hero">
        <span className="sub-hero__label">剩餘本金 · 依還款表自動計算</span>
        <Amount value={balance} currency={foreign} className="sub-hero__value" />
      </header>
      <section className="list-group">
        <div className="list">
          <div className="list-row">
            <span className="list-row__main">還款方式</span>
            <span className="list-row__detail">{current ? describeMode(current) : '—'}</span>
          </div>
          <div className="list-row">
            <span className="list-row__main">下一期扣款</span>
            <span className="list-row__detail">
              {next ? (
                <>
                  {formatDate(next.date, today)}・
                  <Amount value={next.payment} currency={foreign} />
                </>
              ) : (
                '—'
              )}
            </span>
          </div>
          <button
            type="button"
            className="list-row list-row--button list-row--accent"
            onClick={() => onOpen('repay', loan.id)}
          >
            還款試算表
          </button>
          <button
            type="button"
            className="list-row list-row--button list-row--accent"
            onClick={() => onOpen('detail', loan.id)}
          >
            編輯與紀錄
          </button>
        </div>
        <p className="list-group__note">
          這筆貸款的金額由還款表自動計算；利率、還款方式與提前還款在「編輯與紀錄」或「還款試算表」修改。
        </p>
      </section>
    </>
  );
}
