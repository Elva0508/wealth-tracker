/** 設定頁的非同步操作：執行中鎖住按鈕，結果用底部提示顯示 */
import { useIonToast } from '@ionic/react';
import { useCallback, useState } from 'react';

export function useTask() {
  const [busy, setBusy] = useState(false);
  const [presentToast] = useIonToast();

  const notify = useCallback(
    (message: string, error = false) =>
      presentToast({ message, duration: error ? 4000 : 2200, position: 'top', color: error ? 'danger' : undefined }),
    [presentToast],
  );

  const run = useCallback(
    async (task: () => Promise<void>) => {
      setBusy(true);
      try {
        await task();
      } catch (e) {
        notify(`發生錯誤：${e instanceof Error ? e.message : String(e)}`, true);
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );

  return { busy, run, notify };
}
