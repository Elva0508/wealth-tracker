import type { TaskMessage } from '../hooks/useTask';

/** 操作結果提示，顯示在頁面最上方 */
export function TaskNotice({ message }: { message: TaskMessage }) {
  return (
    <p className={`task-notice ${message.error ? 'task-notice--error' : ''}`} role={message.error ? 'alert' : 'status'}>
      {message.text}
    </p>
  );
}
