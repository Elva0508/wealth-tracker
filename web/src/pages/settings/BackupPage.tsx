import { type BackupFile, type BackupPreview, validateBackup } from '@core';
import { useIonAlert } from '@ionic/react';
import { type ChangeEvent, useState } from 'react';
import { Page } from '../../components/Page';
import { useAppData } from '../../hooks/useAppData';
import { useTask } from '../../hooks/useTask';
import * as api from '../../lib/api';
import { downloadFile, fileStamp } from '../../lib/download';

export function BackupPage() {
  const { reload } = useAppData();
  const { busy, run, notify } = useTask();
  const [presentAlert] = useIonAlert();
  const [pending, setPending] = useState<{ backup: BackupFile; preview: BackupPreview } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const downloadBackup = () =>
    run(async () => {
      const backup = await api.buildBackup();
      downloadFile(JSON.stringify(backup, null, 2), `完整備份-${fileStamp()}.json`, 'application/json');
    });

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

  const restore = () =>
    run(async () => {
      if (!pending) return;
      // 還原前先自動下載一份目前資料，萬一選錯檔案還能救回來
      const current = await api.buildBackup();
      downloadFile(JSON.stringify(current, null, 2), `還原前自動備份-${fileStamp()}.json`, 'application/json');
      const result = await api.restoreBackup(pending.backup);
      await reload();
      setPending(null);
      notify(`還原完成：${result.items} 個項目、${result.snapshots} 筆快照。還原前的資料已自動下載。`);
    });

  const confirmRestore = () =>
    presentAlert({
      header: '用這份備份覆蓋目前資料？',
      message: '還原前會先自動下載一份目前的資料。',
      buttons: [
        { text: '取消', role: 'cancel' },
        { text: '還原', role: 'destructive', handler: () => void restore() },
      ],
    });

  return (
    <Page title="備份與還原" backHref="/settings" backText="設定">
      <section className="list-group">
        <div className="list">
          <button
            type="button"
            className="list-row list-row--button list-row--accent"
            disabled={busy}
            onClick={downloadBackup}
          >
            下載完整備份
          </button>
          <label className="list-row list-row--button list-row--accent file-button">
            選擇備份檔還原
            <input type="file" accept="application/json,.json" onChange={pick} disabled={busy} />
          </label>
        </div>
        <p className="list-group__note">備份包含所有項目、修改紀錄與每日快照。還原會覆蓋目前資料。</p>
      </section>

      {errors.length > 0 && (
        <ul className="field__error" role="alert">
          {errors.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      {pending && (
        <section className="list-group" aria-label="備份內容預覽">
          <h2 className="list-group__label">備份內容</h2>
          <dl className="list">
            <div className="list-row">
              <dt className="list-row__main">備份時間（UTC）</dt>
              <dd className="list-row__detail">{pending.preview.exportedAt.slice(0, 16).replace('T', ' ')}</dd>
            </div>
            <div className="list-row">
              <dt className="list-row__main">項目</dt>
              <dd className="list-row__detail">
                {pending.preview.itemCount} 個（使用中 {pending.preview.activeItemCount}）
              </dd>
            </div>
            <div className="list-row">
              <dt className="list-row__main">快照</dt>
              <dd className="list-row__detail">
                {pending.preview.snapshotCount} 筆
                {pending.preview.firstSnapshotDate &&
                  `（${pending.preview.firstSnapshotDate} ～ ${pending.preview.lastSnapshotDate}）`}
              </dd>
            </div>
          </dl>
          <div className="button-row">
            <button type="button" className="btn btn--danger" disabled={busy} onClick={confirmRestore}>
              還原這份備份
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setPending(null)}>
              取消
            </button>
          </div>
        </section>
      )}
    </Page>
  );
}
