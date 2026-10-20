/**
 * 底部彈出面板：從底部滑上來，拖住上方往下拉或點背景就關閉。
 * 使用原生 <dialog>：內建焦點鎖定、Esc 關閉與背景遮罩。
 *
 * 掛上去就打開；關閉時先播完滑下去的動畫，再呼叫 onClose 讓外層移除。
 * children 是函式，拿到 close() 才能在儲存後也用同樣的動畫關閉。
 */
import { type PointerEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

/** 往下拖超過這個距離，或拖得夠快，放開就關閉 */
const DISMISS_PX = 120;
const DISMISS_VELOCITY = 0.6; // px/ms

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const drag = useRef<{ startY: number; startT: number; dy: number } | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const close = useCallback(() => setClosing(true), []);

  function finish() {
    ref.current?.close();
    onClose();
  }

  function setOffset(px: number, animate: boolean) {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.style.transition = animate ? 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
    dialog.style.transform = px > 0 ? `translateY(${px}px)` : '';
  }

  function onPointerDown(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { startY: e.clientY, startT: e.timeStamp, dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.startY);
    setOffset(drag.current.dy, false);
  }

  function onPointerUp(e: PointerEvent) {
    if (!drag.current) return;
    const { dy, startT } = drag.current;
    drag.current = null;
    const velocity = dy / Math.max(1, e.timeStamp - startT);
    if (dy > DISMISS_PX || (dy > 20 && velocity > DISMISS_VELOCITY)) {
      // 從目前拖到的位置接著滑下去
      ref.current?.style.setProperty('--sheet-from', `${dy}px`);
      setOffset(0, false);
      close();
    } else {
      setOffset(0, true);
    }
  }

  return (
    <dialog
      ref={ref}
      className={`sheet ${closing ? 'sheet--closing' : ''}`}
      aria-labelledby="sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        // 點背景遮罩關閉
        if (e.target === ref.current) close();
      }}
      onAnimationEnd={(e) => {
        if (closing && e.target === ref.current) finish();
      }}
    >
      <div className="sheet__body">
        <div
          className="sheet__head"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="sheet__grip" aria-hidden="true" />
          <div className="sheet__bar">
            <button type="button" className="text-button" onClick={close}>
              取消
            </button>
            <h2 id="sheet-title">{title}</h2>
            <span className="sheet__bar-spacer" />
          </div>
        </div>
        <div className="sheet__content">{children(close)}</div>
      </div>
    </dialog>
  );
}
