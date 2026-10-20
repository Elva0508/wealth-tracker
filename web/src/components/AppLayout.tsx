/**
 * App 外框：頁面堆疊＋底部浮動導覽列。
 *
 * 頁面堆疊完全由網址決定：/overview/cash_bank/1 就是「總覽 → 分類 → 項目」三層。
 * 每一層都是獨立捲動的全螢幕圖層，上層頁面一直留著（只是藏起來），所以：
 * - 往下一層：新頁面從右邊滑入，上一頁同時往左退，全程都看得到
 * - 返回：目前頁面往右滑出，底下的上一頁滑回來，捲動位置也還在
 * - 左緣滑動返回（從主畫面開啟時）：上一頁就在底下，跟著手指移動
 * - 切換底部分頁：直接換，不播動畫（iOS 也是這樣）
 *
 * 每段動畫都有計時器保底，就算 animationend 漏掉也不會卡住。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate, useNavigationType, useRoutes } from 'react-router';
import { continueTabSwitch, goBack, pendingTabTarget, switchTab, takePendingBack } from '../lib/navigation';
import { pageRoutes } from '../routes';
import { ChartIcon, ListIcon, LoanIcon, SettingsIcon } from './Icons';

const LINKS = [
  { to: '/overview', label: '總覽', icon: <ListIcon size={20} /> },
  { to: '/investments', label: '投資', icon: <ChartIcon size={20} /> },
  { to: '/loans', label: '貸款', icon: <LoanIcon size={20} /> },
  { to: '/settings', label: '設定', icon: <SettingsIcon size={20} /> },
];

/** 換頁動畫長度，要和 CSS 的 --page-duration 一致；計時器保底也用它 */
const PAGE_DURATION_MS = 400;
/** 從螢幕左緣這個範圍內開始往右滑，才算返回手勢 */
const EDGE_PX = 24;
/** 往右拖超過畫面寬度的這個比例，或甩得夠快，放開就返回 */
const SWIPE_RATIO = 0.35;
const SWIPE_VELOCITY = 0.5; // px/ms
/** 底下那一頁靜止時往左退的比例，和 CSS 的 page-under 一致 */
const UNDER_SHIFT = 0.3;
const IOS_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

type Animation = 'none' | 'push' | 'pop';

/** /overview/cash_bank/1 → ['/overview', '/overview/cash_bank', '/overview/cash_bank/1'] */
function stackOf(path: string): string[] {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return ['/'];
  return parts.map((_, i) => '/' + parts.slice(0, i + 1).join('/'));
}

/** 用指定的網址渲染一頁（上層頁面不是目前網址，所以要自己指定） */
function Layer({ path }: { path: string }) {
  return useRoutes(pageRoutes, path);
}

export function AppLayout() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  // 切換分頁時會先退回第一筆紀錄再換掉它，途中直接顯示目標分頁
  const to = pendingTabTarget() ?? location.pathname;

  // 網址一變就決定這次的動畫；同一頁重新渲染時沿用，不會打斷播到一半的動畫
  const transition = useRef({ id: 0, path: to, from: to, animation: 'none' as Animation });
  if (transition.current.path !== to) {
    const from = transition.current.path;
    const fromStack = stackOf(from);
    const toStack = stackOf(to);
    let animation: Animation = 'none';
    if (fromStack[0] === toStack[0] && fromStack.length !== toStack.length) {
      if (toStack.length > fromStack.length) {
        // 瀏覽器的「下一頁」不播動畫
        animation = navigationType === 'POP' ? 'none' : 'push';
      } else if (navigationType !== 'POP') {
        animation = 'pop'; // 例如在下一層點了同一個分頁回到第一層
      } else {
        // App 自己的返回鍵才播；Safari 的返回手勢已經有自己的動畫，滑動返回則已經播完
        animation = takePendingBack() === 'animate' ? 'pop' : 'none';
      }
    }
    // 其他 POP（例如切換分頁時退回第一筆）也要把記號取走，免得留到下一次
    if (navigationType === 'POP') takePendingBack();
    transition.current = { id: transition.current.id + 1, path: to, from, animation };
  }
  const { id, from, animation } = transition.current;

  const [finishedId, setFinishedId] = useState(0);
  const animating = animation !== 'none' && finishedId !== id;
  useEffect(() => {
    if (!animating) return;
    const timer = window.setTimeout(() => setFinishedId(id), PAGE_DURATION_MS + 150);
    return () => window.clearTimeout(timer);
  }, [animating, id]);

  // 切換分頁：退回第一筆紀錄後換成目標分頁，再清掉「下一頁」的紀錄
  useLayoutEffect(() => {
    continueTabSwitch(navigate, location.pathname);
  }, [location, navigate]);

  // 換頁後清掉滑動手勢留下的位移
  const layoutRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    layoutRef.current?.querySelectorAll<HTMLElement>('.layer').forEach((el) => {
      el.style.transition = '';
      el.style.transform = '';
      el.style.visibility = '';
      el.style.boxShadow = '';
    });
  }, [to]);

  const stack = stackOf(to);
  // 返回動畫播放時，剛離開的那一頁還要留著滑出去
  const leaving = animating && animation === 'pop' ? from : null;
  const layers = leaving ? [...stack, leaving] : stack;

  const roleOf = (path: string, index: number): string => {
    const top = stack.length - 1;
    if (path === leaving) return 'layer--pop-out';
    if (index === top) {
      if (!animating) return 'layer--top';
      return animation === 'push' ? 'layer--top layer--push-in' : 'layer--top layer--pop-in';
    }
    if (index === top - 1 && animating && animation === 'push') return 'layer--push-out';
    return 'layer--hidden';
  };

  // 從主畫面開啟時沒有 Safari 的返回手勢，自己做一個跟著手指移動的版本
  const nested = stack.length > 1;
  const parentPath = stack[stack.length - 2] ?? '/';
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const root = layoutRef.current;
    if (!standalone || !nested || !root) return;

    let start: { x: number; y: number } | null = null;
    let dragging = false;
    let samples: { x: number; t: number }[] = [];
    let frame = 0;
    let topEl: HTMLElement | null = null;
    let underEl: HTMLElement | null = null;

    const place = (dx: number) => {
      if (!topEl || !underEl) return;
      const width = root.clientWidth;
      const progress = Math.min(1, Math.max(0, dx / width));
      topEl.style.transform = `translateX(${dx}px)`;
      underEl.style.transform = `translateX(${-UNDER_SHIFT * 100 * (1 - progress)}%)`;
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start = e.touches.length === 1 && t.clientX <= EDGE_PX ? { x: t.clientX, y: t.clientY } : null;
      dragging = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (!dragging) {
        // 先確定是往右的水平滑動，再接手；否則交給一般捲動
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (dx <= 0 || Math.abs(dy) > Math.abs(dx) || !e.cancelable) {
          start = null;
          return;
        }
        topEl = root.querySelector<HTMLElement>('.layer--top');
        underEl = root.querySelector<HTMLElement>(`.layer[data-path="${CSS.escape(parentPath)}"]`);
        if (!topEl || !underEl) {
          start = null;
          return;
        }
        dragging = true;
        for (const el of [topEl, underEl]) el.style.transition = 'none';
        underEl.style.visibility = 'visible';
        topEl.style.boxShadow = '-10px 0 30px rgb(70 58 36 / 0.12)';
      }
      e.preventDefault();
      samples.push({ x: t.clientX, t: e.timeStamp });
      if (samples.length > 5) samples.shift();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => place(Math.max(0, dx)));
    };

    const onEnd = () => {
      if (!dragging || !start || !topEl || !underEl) {
        start = null;
        return;
      }
      cancelAnimationFrame(frame);
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dx = Math.max(0, last.x - start.x);
      const velocity = (last.x - first.x) / Math.max(1, last.t - first.t);
      const width = root.clientWidth;
      const commit = dx > width * SWIPE_RATIO || velocity > SWIPE_VELOCITY;
      const top = topEl;
      const under = underEl;
      start = null;
      dragging = false;
      samples = [];
      place(dx);

      const duration = commit
        ? Math.round(Math.min(PAGE_DURATION_MS, Math.max(180, (width - dx) / Math.max(velocity, 1))))
        : 300;
      for (const el of [top, under]) el.style.transition = `transform ${duration}ms ${IOS_EASE}`;
      // 下一幀再設定終點，transition 才會從目前位置開始
      requestAnimationFrame(() => {
        if (commit) {
          top.style.transform = 'translateX(100%)';
          under.style.transform = 'translateX(0)';
        } else {
          top.style.transform = '';
          under.style.transform = `translateX(${-UNDER_SHIFT * 100}%)`;
        }
      });
      window.setTimeout(() => {
        if (commit) {
          goBack(navigate, parentPath, 'skip');
        } else {
          for (const el of [top, under]) {
            el.style.transition = '';
            el.style.transform = '';
          }
          under.style.visibility = '';
          top.style.boxShadow = '';
        }
      }, duration);
    };

    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchmove', onMove, { passive: false });
    root.addEventListener('touchend', onEnd);
    root.addEventListener('touchcancel', onEnd);
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener('touchstart', onStart);
      root.removeEventListener('touchmove', onMove);
      root.removeEventListener('touchend', onEnd);
      root.removeEventListener('touchcancel', onEnd);
    };
  }, [nested, parentPath, navigate]);

  return (
    <div className="layout" ref={layoutRef}>
      {layers.map((path, index) => (
        <div
          // key 用網址：上層頁面在往下一層、返回之間都是同一個元素，內容和捲動位置都保留
          key={path}
          data-path={path}
          className={`layer ${roleOf(path, index)}`}
          style={{ zIndex: index + 1 }}
          aria-hidden={roleOf(path, index).includes('layer--top') ? undefined : true}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && animating) setFinishedId(id);
          }}
        >
          <Layer path={path} />
        </div>
      ))}

      {/* 導覽列後方墊一層漸層背景色，捲到底下的文字不會和導覽列疊在一起 */}
      <div className="tabbar-scrim" aria-hidden="true" />
      <nav className="tabbar" aria-label="主要導覽">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            replace
            className="tabbar__link"
            onClick={(e) => {
              e.preventDefault();
              switchTab(navigate, link.to, location.pathname);
            }}
          >
            {link.icon}
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
