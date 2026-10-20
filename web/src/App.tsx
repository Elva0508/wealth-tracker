import { Navigate, RouterProvider, createBrowserRouter } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { AppDataProvider } from './hooks/useAppData';
import { useAuth } from './hooks/useAuth';
import { CategoryPage } from './pages/CategoryPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { ItemPage } from './pages/ItemPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SettingsPage } from './pages/SettingsPage';
import { ArchivedPage } from './pages/settings/ArchivedPage';
import { BackupPage } from './pages/settings/BackupPage';
import { ExportPage } from './pages/settings/ExportPage';

// 分頁第一層：總覽、投資、貸款、設定；底下各自有下一層頁面
const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: 'overview', element: <OverviewPage /> },
      { path: 'overview/:category', element: <CategoryPage /> },
      { path: 'overview/:category/:itemId', element: <ItemPage /> },
      {
        path: 'investments',
        element: (
          <ComingSoonPage
            title="投資管理"
            stage="V1b"
            description="券商帳戶與交割戶、逐筆買賣、手續費與交易稅、加權平均與 FIFO 成本、自動股價與股利。"
          />
        ),
      },
      {
        path: 'loans',
        element: (
          <ComingSoonPage
            title="貸款管理"
            stage="V1c"
            description="還款表、固定與浮動利率、自有與貸款資金分類、利息分攤，以及淨資產趨勢圖。"
          />
        ),
      },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/archived', element: <ArchivedPage /> },
      { path: 'settings/export', element: <ExportPage /> },
      { path: 'settings/backup', element: <BackupPage /> },
      { path: '*', element: <Navigate to="/overview" replace /> },
    ],
  },
]);

export function App() {
  const { session, loading, recovering } = useAuth();

  if (loading) return <p className="page-message">載入中…</p>;
  if (recovering) return <ResetPasswordPage />;
  if (!session) return <LoginPage />;

  return (
    // key 讓換帳號登入時重新載入資料
    <AppDataProvider key={session.user.id}>
      <RouterProvider router={router} />
    </AppDataProvider>
  );
}
