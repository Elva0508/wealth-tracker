/**
 * 返回上一頁。App 內的返回（返回鍵、左緣滑動）要播返回動畫；
 * 瀏覽器自己的返回（Safari 的左緣手勢、上一頁按鈕）已經有 Safari 的動畫，App 就不再播一次。
 * 兩者都是 POP，所以在這裡先記下「這次是 App 自己發起的」，AppLayout 換頁時讀取。
 */
import type { NavigateFunction } from 'react-router';

export type BackAnimation = 'animate' | 'skip';

let pending: BackAnimation | null = null;

/**
 * 有上一頁就退回去；從網址直接打開時沒有上一頁，改到上一層。
 * animation = 'skip'：動畫已經由滑動手勢播完了
 */
export function goBack(navigate: NavigateFunction, fallback: string, animation: BackAnimation = 'animate') {
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  if (idx > 0) {
    pending = animation;
    navigate(-1);
  } else {
    navigate(fallback, { replace: true });
  }
}

/** AppLayout 用：取出這次返回是不是 App 自己發起的（只能取一次） */
export function takePendingBack(): BackAnimation | null {
  const value = pending;
  pending = null;
  return value;
}
