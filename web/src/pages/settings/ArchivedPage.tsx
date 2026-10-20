import { CATEGORY_LABELS, dec, formatMoney } from '@core';
import { Page } from '../../components/Page';
import { useAppData } from '../../hooks/useAppData';
import { useTask } from '../../hooks/useTask';
import * as api from '../../lib/api';

export function ArchivedPage() {
  const { items, reload } = useAppData();
  const { busy, run, notify } = useTask();
  const archived = items.filter((i) => i.status === 'archived');

  return (
    <Page title="已封存項目" backHref="/settings" backText="設定">
      {archived.length === 0 ? (
        <p className="page-message">沒有已封存的項目。</p>
      ) : (
        <section className="list-group">
          <ul className="list">
            {archived.map((item) => (
              <li key={item.id} className="list-row">
                <span className="list-row__main">
                  <span className="list-row__name">{item.name}</span>
                  <span className="list-row__sub">
                    {CATEGORY_LABELS[item.category]} · {formatMoney(dec(item.amount), item.currency)}
                  </span>
                </span>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api.setArchived(item.id, false);
                      await reload();
                      notify(`已恢復「${item.name}」`);
                    })
                  }
                >
                  恢復
                </button>
              </li>
            ))}
          </ul>
          <p className="list-group__note">封存的項目不計入總額，恢復後會回到原本的分類。</p>
        </section>
      )}
    </Page>
  );
}
