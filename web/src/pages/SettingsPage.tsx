/**
 * 設定：隱私、已封存項目、匯出、備份與還原、帳號、資料來源。
 */
import {
  type BackupFile,
  type BackupPreview,
  CATEGORY_LABELS,
  dec,
  formatMoney,
  itemsExportTable,
  toCsv,
  toXlsx,
  validateBackup,
} from '@core';
import { type ChangeEvent, useState } from 'react';
import { useAppData } from '../hooks/useAppData';
import { useAuth } from '../hooks/useAuth';
import * as api from '../lib/api';
import { downloadFile, fileStamp } from '../lib/download';
import { supabase } from '../lib/supabase';

export function SettingsPage() {
  const { items, rates, settings, setHideByDefault, reload } = useAppData();
  const { session } = useAuth();
  const archived = items.filter((i) => i.status === 'archived');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await task();
    } catch (e) {
      setMessage(`發生錯誤：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const exportCsv = () =>
    downloadFile(toCsv(itemsExportTable(items, rates)), `資產負債-${fileStamp()}.csv`, 'text/csv;charset=utf-8');
  const exportXlsx = () =>
    downloadFile(
      toXlsx(itemsExportTable(items, rates)),
      `資產負債-${fileStamp()}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  const downloadBackup = async () => {
    const backup = await api.buildBackup();
    downloadFile(JSON.stringify(backup, null, 2), `完整備份-${fileStamp()}.json`, 'application/json');
  };

  return (
    <div className="settings">
      <h1>設定</h1>
      {message && (
        <p className="card notice" role="status">
          {message}
        </p>
      )}

      <section className="card setting-block">
        <h2>隱私</h2>
        <label className="switch-row">
          <span>開啟 App 時預設隱藏金額</span>
          <input
            type="checkbox"
            role="switch"
            checked={settings?.hideAmounts ?? true}
            disabled={busy || !settings}
            onChange={(e) => run(() => setHideByDefault(e.target.checked))}
          />
        </label>
      </section>

      <section className="card setting-block">
        <h2>已封存項目</h2>
        {archived.length === 0 ? (
          <p className="muted small">沒有已封存的項目。</p>
        ) : (
          <ul className="archived-list">
            {archived.map((item) => (
              <li key={item.id}>
                <span>
                  <span>{item.name}</span>
                  <span className="muted small">
                    {CATEGORY_LABELS[item.category]} · {formatMoney(dec(item.amount), item.currency)}
                  </span>
                </span>
                <button
                  type="button"
                  className="button button--small"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api.setArchived(item.id, false);
                      await reload();
                      setMessage(`已恢復「${item.name}」`);
                    })
                  }
                >
                  恢復
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card setting-block">
        <h2>匯出到試算表</h2>
        <p className="muted small">包含所有項目（含已封存）與目前匯率換算，不受隱藏金額設定影響。</p>
        <div className="button-row">
          <button type="button" className="button" onClick={exportCsv}>
            下載 CSV
          </button>
          <button type="button" className="button" onClick={exportXlsx}>
            下載 Excel
          </button>
        </div>
      </section>

      <section className="card setting-block">
        <h2>完整備份與還原</h2>
        <p className="muted small">備份包含所有項目、修改紀錄與每日快照。還原會覆蓋目前資料。</p>
        <div className="button-row">
          <button type="button" className="button" disabled={busy} onClick={() => run(downloadBackup)}>
            下載完整備份
          </button>
        </div>
        <RestoreBackup busy={busy} run={run} onDone={setMessage} />
      </section>

      <section className="card setting-block">
        <h2>帳號</h2>
        <p className="small">{session?.user.email}</p>
        <button type="button" className="button" onClick={() => supabase.auth.signOut()}>
          登出
        </button>
      </section>

      <section className="setting-block setting-block--plain">
        <p className="muted small">
          匯率來源：臺灣銀行牌告匯率（即期買賣中間價）。備援：
          <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">
            Rates By Exchange Rate API
          </a>
        </p>
      </section>
    </div>
  );
}

function RestoreBackup({
  busy,
  run,
  onDone,
}: {
  busy: boolean;
  run: (task: () => Promise<void>) => Promise<void>;
  onDone: (message: string) => void;
}) {
  const { reload } = useAppData();
  const [pending, setPending] = useState<{ backup: BackupFile; preview: BackupPreview } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    setPending(null);
    setErrors([]);
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setErrors(['檔案不是有效的 JSON']);
      return;
    }
    const result = validateBackup(parsed);
    if (result.ok) setPending({ backup: result.backup, preview: result.preview });
    else setErrors(result.errors);
  }

  const confirmRestore = () =>
    run(async () => {
      if (!pending) return;
      // 還原前先自動下載一份目前資料，萬一選錯檔案還能救回來
      const current = await api.buildBackup();
      downloadFile(JSON.stringify(current, null, 2), `還原前自動備份-${fileStamp()}.json`, 'application/json');
      const result = await api.restoreBackup(pending.backup);
      await reload();
      setPending(null);
      onDone(`還原完成：${result.items} 個項目、${result.snapshots} 筆快照。還原前的資料已自動下載。`);
    });

  return (
    <div className="restore">
      <label className="button file-button">
        選擇備份檔還原
        <input type="file" accept="application/json,.json" onChange={pick} disabled={busy} />
      </label>
      {errors.length > 0 && (
        <ul className="field__error" role="alert">
          {errors.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {pending && (
        <div className="restore__preview" role="region" aria-label="備份內容預覽">
          <p>
            備份時間：{pending.preview.exportedAt.slice(0, 16).replace('T', ' ')}（UTC）
            <br />
            項目：{pending.preview.itemCount} 個（使用中 {pending.preview.activeItemCount}）
            <br />
            快照：{pending.preview.snapshotCount} 筆
            {pending.preview.firstSnapshotDate &&
              `（${pending.preview.firstSnapshotDate} ～ ${pending.preview.lastSnapshotDate}）`}
          </p>
          <p className="warning">確認後會用這份備份覆蓋目前所有資料。</p>
          <div className="button-row">
            <button type="button" className="button button--danger" disabled={busy} onClick={confirmRestore}>
              確認還原
            </button>
            <button type="button" className="button" disabled={busy} onClick={() => setPending(null)}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
