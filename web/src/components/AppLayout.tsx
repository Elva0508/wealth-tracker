/** 導覽：手機在底部、電腦在左側（切換點寫在 CSS） */
import { NavLink, Outlet } from 'react-router';
import { ChartIcon, ListIcon, LoanIcon, SettingsIcon } from './Icons';

const LINKS = [
  { to: '/', label: '資產總覽', icon: <ListIcon size={22} />, end: true },
  { to: '/investments', label: '投資管理', icon: <ChartIcon size={22} /> },
  { to: '/loans', label: '貸款管理', icon: <LoanIcon size={22} /> },
  { to: '/settings', label: '設定', icon: <SettingsIcon size={22} /> },
];

export function AppLayout() {
  return (
    <div className="layout">
      <nav className="nav" aria-label="主要導覽">
        <span className="nav__brand">資產總覽</span>
        {LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end} className="nav__link">
            {link.icon}
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
