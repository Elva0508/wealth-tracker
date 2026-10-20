/** 第三層：編輯單一項目 */
import { CATEGORY_LABELS, isCategory } from '@core';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ItemForm } from '../components/ItemForm';
import { Page } from '../components/Page';
import { useAppData } from '../hooks/useAppData';
import * as api from '../lib/api';
import { goBack } from '../lib/navigation';

export function ItemPage() {
  const { category, itemId } = useParams();
  const { items, loading, reload } = useAppData();
  const navigate = useNavigate();
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const backHref = category && isCategory(category) ? `/overview/${category}` : '/overview';
  // 分類名稱太長會擠到標題，超過四個字就只寫「返回」（iOS 也是這樣處理）
  const categoryLabel = category && isCategory(category) ? CATEGORY_LABELS[category] : '總覽';
  const backText = categoryLabel.length <= 4 ? categoryLabel : '返回';
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
    <Page title={item?.name ?? '項目'} backHref={backHref} backText={backText}>
      {loading ? (
        <p className="page-message">載入中…</p>
      ) : !item ? (
        <p className="page-message">找不到這個項目，可能已經封存。</p>
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
              <button type="button" className="btn btn--quiet" onClick={confirmArchive}>
                封存這個項目
              </button>
            </>
          }
        />
      )}
    </Page>
  );
}
