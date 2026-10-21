/**
 * 所有頁面的路由表。網址的每一段就是一層：/overview/liquid/1 = 總覽 → 大類 → 項目。
 * AppLayout 用這張表把目前頁面和它的每一層上層頁面都渲染出來（iOS 的頁面堆疊）。
 */
import { Navigate, type RouteObject } from 'react-router';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { GroupPage } from './pages/GroupPage';
import { ItemPage } from './pages/ItemPage';
import { LoanPage } from './pages/LoanPage';
import { LoanSchedulePage } from './pages/LoanSchedulePage';
import { LoansPage } from './pages/LoansPage';
import { OverviewPage } from './pages/OverviewPage';
import { SettingsPage } from './pages/SettingsPage';
import { ArchivedPage } from './pages/settings/ArchivedPage';
import { BackupPage } from './pages/settings/BackupPage';
import { ExportPage } from './pages/settings/ExportPage';

export const pageRoutes: RouteObject[] = [
  { path: '/', element: <Navigate to="/overview" replace /> },
  { path: '/overview', element: <OverviewPage /> },
  { path: '/overview/:group', element: <GroupPage /> },
  { path: '/overview/:group/:itemId', element: <ItemPage /> },
  {
    path: '/investments',
    element: (
      <ComingSoonPage
        title="投資管理"
        stage="V1c"
        description="券商帳戶與交割戶、逐筆買賣、手續費與交易稅、加權平均與 FIFO 成本、自動股價與股利。"
      />
    ),
  },
  { path: '/loans', element: <LoansPage /> },
  { path: '/loans/:loanId', element: <LoanPage /> },
  { path: '/loans/:loanId/schedule', element: <LoanSchedulePage /> },
  { path: '/settings', element: <SettingsPage /> },
  { path: '/settings/archived', element: <ArchivedPage /> },
  { path: '/settings/export', element: <ExportPage /> },
  { path: '/settings/backup', element: <BackupPage /> },
  { path: '*', element: <Navigate to="/overview" replace /> },
];
