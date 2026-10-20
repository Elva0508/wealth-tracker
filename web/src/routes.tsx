/**
 * 所有頁面的路由表。網址的每一段就是一層：/overview/cash_bank/1 = 總覽 → 分類 → 項目。
 * AppLayout 用這張表把目前頁面和它的每一層上層頁面都渲染出來（iOS 的頁面堆疊）。
 */
import { Navigate, type RouteObject } from 'react-router';
import { CategoryPage } from './pages/CategoryPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { ItemPage } from './pages/ItemPage';
import { OverviewPage } from './pages/OverviewPage';
import { SettingsPage } from './pages/SettingsPage';
import { ArchivedPage } from './pages/settings/ArchivedPage';
import { BackupPage } from './pages/settings/BackupPage';
import { ExportPage } from './pages/settings/ExportPage';

export const pageRoutes: RouteObject[] = [
  { path: '/', element: <Navigate to="/overview" replace /> },
  { path: '/overview', element: <OverviewPage /> },
  { path: '/overview/:category', element: <CategoryPage /> },
  { path: '/overview/:category/:itemId', element: <ItemPage /> },
  {
    path: '/investments',
    element: (
      <ComingSoonPage
        title="投資管理"
        stage="V1b"
        description="券商帳戶與交割戶、逐筆買賣、手續費與交易稅、加權平均與 FIFO 成本、自動股價與股利。"
      />
    ),
  },
  {
    path: '/loans',
    element: (
      <ComingSoonPage
        title="貸款管理"
        stage="V1c"
        description="還款表、固定與浮動利率、自有與貸款資金分類、利息分攤，以及淨資產趨勢圖。"
      />
    ),
  },
  { path: '/settings', element: <SettingsPage /> },
  { path: '/settings/archived', element: <ArchivedPage /> },
  { path: '/settings/export', element: <ExportPage /> },
  { path: '/settings/backup', element: <BackupPage /> },
  { path: '*', element: <Navigate to="/overview" replace /> },
];
