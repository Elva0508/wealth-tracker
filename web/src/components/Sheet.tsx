/**
 * 滿版彈出面板：從底部滑上來蓋住整個畫面，後方畫面不縮放。
 * 使用原生 <dialog>：內建焦點鎖定、Esc 關閉與背景遮罩。
 *
 * 往下拉關閉：拖住標題列，或內容已捲到最上面時往下拉，面板會跟著手指移動；
 * 放開時從當下的位置接著滑下去（甩得越快越快），沒拉夠就彈回原位。
 *
 * 掛上去就打開；關閉時先播完滑下去的動畫，再呼叫 onClose 讓外層移除。
 * children 是函式，拿到 close() 才能在儲存後也用同樣的動畫關閉。
 */
import { type ReactNode, useCallback, useEffect, useRef } from 'react';

/** 往下拉超過畫面高度的這個比例，放開就關閉 */
const DISMISS_RATIO = 0.25;
/** 或往下甩的速度超過這個值（px/ms） */
const DISMISS_VELOCITY = 0.5;
/** iOS 系統面板的動畫曲線 */
const IOS_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

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
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  /** 從目前位置滑到畫面外；duration 依放開時的速度決定 */
  const close = useCallback((durationMs = 320) => {
    const dialog = ref.current;
    if (!dialog || closingRef.current) return;
    closingRef.current = true;
    dialog.classList.add('sheet--closing');
    dialog.style.transition = `transform ${durationMs}ms ${IOS_EASE}`;
    dialog.style.transform = 'translateY(100%)';
    const done = () => {
      dialog.close();
      onCloseRef.current();
    };
    // transitionend 偶爾會漏掉（例如分頁切到背景），用計時器保底
    const timer = window.setTimeout(done, durationMs + 80);
    dialog.addEventListener(
      'transitionend',
      () => {
        window.clearTimeout(timer);
        done();
      },
      { once: true },
    );
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();

    let startY = 0;
    let dragging = false;
    let fromHeader = false;
    let scrolledAtStart = false;
    let samples: { y: number; t: number }[] = [];
    let frame = 0;

    const move = (dy: number) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        dialog.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
        dialog.style.setProperty('--sheet-progress', String(Math.min(1, dy / dialog.clientHeight)));
      });
    };

    const onStart = (e: TouchEvent) => {
      if (closingRef.current || e.touches.length !== 1) return;
      const target = e.target as HTMLElement;
      fromHeader = !!target.closest('.sheet__head') && !target.closest('button');
      // 手指按下時內容已經在最上面，往下拉才算拖面板（iOS 也是這樣）
      scrolledAtStart = dialog.scrollTop > 0;
      startY = e.touches[0].clientY;
      samples = [{ y: startY, t: e.timeStamp }];
      dragging = false;
      dialog.style.transition = 'none';
    };

    const onMove = (e: TouchEvent) => {
      if (closingRef.current || e.touches.length !== 1) return;
      const y = e.touches[0].clientY;
      const dy = y - startY;
      // 內容還能往上捲時，往下拉是捲動內容，不是拖面板
      if (!dragging) {
        if (dy <= 0 || !e.cancelable || (!fromHeader && scrolledAtStart)) return;
        dragging = true;
        startY = y; // 從這裡開始算，面板不會突然跳一段
      }
      e.preventDefault();
      samples.push({ y, t: e.timeStamp });
      if (samples.length > 5) samples.shift();
      move(Math.max(0, y - startY));
    };

    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      cancelAnimationFrame(frame);
      // 用最後一次移動的位置與時間算距離和速度（touchend 的座標不一定可靠）
      const last = samples[samples.length - 1];
      const first = samples[0];
      const dy = Math.max(0, last.y - startY);
      const velocity = (last.y - first.y) / Math.max(1, last.t - first.t);
      const height = dialog.clientHeight;
      dialog.style.transform = `translateY(${dy}px)`;
      if (dy > height * DISMISS_RATIO || velocity > DISMISS_VELOCITY) {
        // 剩下的距離用放開時的速度走完，再限制在合理範圍內
        const remaining = height - dy;
        const duration = Math.round(Math.min(380, Math.max(160, remaining / Math.max(velocity, 1.2))));
        close(duration);
      } else {
        dialog.style.transition = `transform 0.35s ${IOS_EASE}`;
        dialog.style.transform = '';
        dialog.style.removeProperty('--sheet-progress');
      }
    };

    dialog.addEventListener('touchstart', onStart, { passive: true });
    dialog.addEventListener('touchmove', onMove, { passive: false });
    dialog.addEventListener('touchend', onEnd);
    dialog.addEventListener('touchcancel', onEnd);
    return () => {
      cancelAnimationFrame(frame);
      dialog.removeEventListener('touchstart', onStart);
      dialog.removeEventListener('touchmove', onMove);
      dialog.removeEventListener('touchend', onEnd);
      dialog.removeEventListener('touchcancel', onEnd);
    };
  }, [close]);

  const closeDefault = useCallback(() => close(), [close]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        // 電腦版面板沒有滿版，點到面板外面的背景遮罩就關閉
        const box = ref.current?.getBoundingClientRect();
        if (box && (e.clientY < box.top || e.clientY > box.bottom || e.clientX < box.left || e.clientX > box.right)) {
          close();
        }
      }}
    >
      <div className="sheet__head">
        <div className="sheet__grip" aria-hidden="true" />
        <div className="sheet__bar">
          <button type="button" className="text-button" onClick={closeDefault}>
            取消
          </button>
          <h2 id="sheet-title">{title}</h2>
          <span />
        </div>
      </div>
      <div className="sheet__content">{children(closeDefault)}</div>
    </dialog>
  );
}
