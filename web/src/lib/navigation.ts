/**
 * 瀏覽紀錄只放「分頁第一層 → 下一層 → …」，切換分頁不新增紀錄：
 * 否則 Safari 的左右滑動（上一頁／下一頁）會在分頁之間跳來跳去。
 *
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

/**
 * 切換分頁的進度。從下一層切換分頁時要清掉被退掉的頁面，否則 Safari 往左滑（下一頁）會跳回去：
 * returning：退回 App 的第一筆紀錄 → replaced：換成目標分頁 → pushed：再新增一筆同頁（瀏覽器會丟掉所有「下一頁」）
 * → 退回一筆完成。整個過程畫面都顯示目標分頁。
 * 有 then（例如從首頁的貸款項目直接打開貸款頁）時，最後一步改成新增 then 那一頁。
 */
let pendingTab: {
  target: string;
  then: string | null;
  phase: 'returning' | 'replaced' | 'pushed';
  since: number;
} | null = null;

/** 切換分頁正常幾十毫秒就完成；超過這個時間還沒完成就放棄，導覽列不會因此卡住 */
const TAB_SWITCH_TIMEOUT_MS = 1500;

const activeTabSwitch = () => {
  if (pendingTab && Date.now() - pendingTab.since > TAB_SWITCH_TIMEOUT_MS) pendingTab = null;
  return pendingTab;
};

/** 目前 App 在瀏覽紀錄中的位置（0 = App 的第一筆） */
const historyIndex = () => (window.history.state as { idx?: number } | null)?.idx ?? 0;

/**
 * 切換底部分頁：先退回 App 的第一筆紀錄，再把它換成新分頁的第一層。
 * 同一個分頁時就是回到第一層，播返回動畫（iOS 點目前分頁也是這樣）。
 * then：切換完再往下一層打開這一頁，例如 switchTab(navigate, '/loans', path, '/loans/123')
 */
export function switchTab(navigate: NavigateFunction, to: string, currentPath: string, then?: string) {
  if ((currentPath === to && !then) || activeTabSwitch()) return;
  const steps = historyIndex();
  const sameTab = currentPath.split('/')[1] === to.split('/')[1];
  if (steps === 0) {
    if (!then) {
      navigate(to, { replace: true });
      return;
    }
    pendingTab = { target: to, then, phase: 'replaced', since: Date.now() };
    if (currentPath === to) continueTabSwitch(navigate, to);
    else navigate(to, { replace: true });
    return;
  }
  pendingTab = { target: to, then: then ?? null, phase: 'returning', since: Date.now() };
  pending = sameTab ? 'animate' : 'skip';
  navigate(-steps);
}

/** AppLayout 用：切換分頁途中，畫面直接顯示目標分頁，不閃過舊頁面 */
export function pendingTabTarget(): string | null {
  return activeTabSwitch()?.target ?? null;
}

/** AppLayout 每次網址改變時呼叫，推進切換分頁的下一步 */
export function continueTabSwitch(navigate: NavigateFunction, pathname: string) {
  const current = activeTabSwitch();
  if (!current) return;
  const { target, then, phase } = current;
  if (phase === 'returning') {
    current.phase = 'replaced';
    if (pathname !== target) navigate(target, { replace: true });
    else continueTabSwitch(navigate, pathname);
  } else if (phase === 'replaced' && pathname === target) {
    if (then) {
      // 新增 then 那一頁：同時也清掉了「下一頁」的紀錄
      pendingTab = null;
      navigate(then);
      return;
    }
    current.phase = 'pushed';
    navigate(target);
  } else if (phase === 'pushed' && pathname === target) {
    pendingTab = null;
    navigate(-1);
  }
}
