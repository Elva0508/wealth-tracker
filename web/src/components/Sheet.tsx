/**
 * 底部彈出面板（手機）/ 置中對話框（電腦）。
 * 使用原生 <dialog>：內建焦點鎖定、Esc 關閉與背景遮罩。
 */
import { type ReactNode, useEffect, useRef } from 'react';
import { CloseIcon } from './Icons';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // 點背景遮罩關閉
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="sheet__body">
        <div className="sheet__grip" aria-hidden="true" />
        <div className="sheet__head">
          <h2 id="sheet-title">{title}</h2>
          <button type="button" className="icon-button" aria-label="關閉" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
