/**
 * 設定第一層：隱私開關、帳號，其餘功能點進下一層。
 */
import { useNavigate } from 'react-router';
import { ChevronRightIcon } from '../components/Icons';
import { Page } from '../components/Page';
import { useAppData } from '../hooks/useAppData';
import { useAuth } from '../hooks/useAuth';
import { TaskNotice } from '../components/TaskNotice';
import { useTask } from '../hooks/useTask';
import { supabase } from '../lib/supabase';

export function SettingsPage() {
  const { items, settings, setHideByDefault } = useAppData();
  const { session } = useAuth();
  const { busy, run, message } = useTask();
  const navigate = useNavigate();
  const archivedCount = items.filter((i) => i.status === 'archived').length;

  const link = (to: string, label: string, value?: string) => (
    <button type="button" className="list-row list-row--button" onClick={() => navigate(to)}>
      <span className="list-row__main">{label}</span>
      {value && <span className="list-row__detail">{value}</span>}
      <span className="list-row__chevron">
        <ChevronRightIcon size={16} />
      </span>
    </button>
  );

  return (
    <Page title="設定" largeTitle>
      {message && <TaskNotice message={message} />}
      <section className="list-group">
        <h2 className="list-group__label">隱私</h2>
        <div className="list">
          <div className="list-row">
            <span className="list-row__main">開啟 App 時隱藏金額</span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              aria-label="開啟 App 時隱藏金額"
              checked={settings?.hideAmounts ?? true}
              disabled={busy || !settings}
              onChange={(e) => run(() => setHideByDefault(e.target.checked))}
            />
          </div>
        </div>
      </section>

      <section className="list-group">
        <h2 className="list-group__label">資料</h2>
        <div className="list">
          {link('/settings/archived', '已封存項目', archivedCount > 0 ? String(archivedCount) : '無')}
          {link('/settings/export', '匯出到試算表')}
          {link('/settings/backup', '完整備份與還原')}
        </div>
      </section>

      <section className="list-group">
        <h2 className="list-group__label">帳號</h2>
        <div className="list">
          <div className="list-row">
            <span className="list-row__main list-row__name">{session?.user.email}</span>
          </div>
          <button
            type="button"
            className="list-row list-row--button list-row--danger"
            onClick={() => supabase.auth.signOut()}
          >
            登出
          </button>
        </div>
      </section>

      <p className="footnote">
        匯率來源：臺灣銀行牌告匯率（即期買賣中間價）。備援：
        <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">
          Rates By Exchange Rate API
        </a>
      </p>
    </Page>
  );
}
