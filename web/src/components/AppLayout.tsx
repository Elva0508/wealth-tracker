/**
 * App 外框：目前的頁面＋底部浮動導覽列。
 *
 * 換頁動畫只用 CSS：畫面上永遠只有一個頁面，新頁面掛上去時自己播一段進場動畫。
 * - 往下一層：從右邊滑入
 * - 回到上一層（返回鍵、滑動返回、點分頁回到第一層）：上一頁從左邊滑回
 * - 切換底部分頁：不播動畫（iOS 也是這樣）
 */
import { useEffect, useRef } from 'react';
import { NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import { ChartIcon, ListIcon, LoanIcon, SettingsIcon } from './Icons';

const LINKS = [
  { to: '/overview', label: '總覽', icon: <ListIcon size={20} /> },
  { to: '/investments', label: '投資', icon: <ChartIcon size={20} /> },
  { to: '/loans', label: '貸款', icon: <LoanIcon size={20} /> },
  { to: '/settings', label: '設定', icon: <SettingsIcon size={20} /> },
];

/** 從螢幕左緣這個範圍內開始往右滑，才算返回手勢 */
const EDGE_PX = 24;
/** 往右滑超過這個距離就返回 */
const SWIPE_BACK_PX = 70;

const segments = (path: string) => path.split('/').filter(Boolean);

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  // 網址一變就和上一個網址比較，決定這次的進場動畫；同一頁重新渲染時沿用，不會打斷播到一半的動畫
  const to = location.pathname;
  const transition = useRef({ path: to, animation: 'none' });
  if (transition.current.path !== to) {
    const from = transition.current.path;
    const depthChange = segments(to).length - segments(from).length;
    const animation =
      segments(from)[0] !== segments(to)[0] || depthChange === 0 ? 'none' : depthChange > 0 ? 'push' : 'pop';
    transition.current = { path: to, animation };
  }

  // 從主畫面開啟時沒有 Safari 的返回手勢，自己補一個：從左緣往右滑就回上一頁
  const nested = segments(to).length > 1;
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone || !nested) return;
    let start: { x: number; y: number } | null = null;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start = e.touches.length === 1 && t.clientX <= EDGE_PX ? { x: t.clientX, y: t.clientY } : null;
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);
      start = null;
      if (dx > SWIPE_BACK_PX && dy < dx / 2) navigate(-1);
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [nested, navigate]);

  return (
    <div className="layout">
      {/* key：每次換頁都是新的元素，進場動畫一定從頭播，不會有舊頁面殘留 */}
      <main key={to} className={`page page--${transition.current.animation}`}>
        <Outlet />
      </main>

      {/* 導覽列後方墊一層漸層背景色，捲到底下的文字不會和導覽列疊在一起 */}
      <div className="tabbar-scrim" aria-hidden="true" />
      <nav className="tabbar" aria-label="主要導覽">
        {LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} className="tabbar__link">
            {link.icon}
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* 往下一層時捲到最上面；返回時回到原本捲到的位置 */}
      <ScrollRestoration />
    </div>
  );
}
