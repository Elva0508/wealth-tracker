/** 設定頁的非同步操作：執行中鎖住按鈕，結果顯示在頁面上方的提示 */
import { useCallback, useState } from 'react';

export interface TaskMessage {
  text: string;
  error: boolean;
}

export function useTask() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<TaskMessage | null>(null);

  const notify = useCallback((text: string, error = false) => setMessage({ text, error }), []);

  const run = useCallback(
    async (task: () => Promise<void>) => {
      setBusy(true);
      setMessage(null);
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

  return { busy, run, notify, message };
}
