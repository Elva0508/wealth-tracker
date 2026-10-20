import { Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { AppDataProvider } from './hooks/useAppData';
import { useAuth } from './hooks/useAuth';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  const { session, loading, recovering } = useAuth();

  if (loading) return <p className="page-message">載入中…</p>;
  if (recovering) return <ResetPasswordPage />;
  if (!session) return <LoginPage />;

  return (
    // key 讓換帳號登入時重新載入資料
    <AppDataProvider key={session.user.id}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<OverviewPage />} />
          <Route
            path="investments"
            element={
              <ComingSoonPage
                title="投資管理"
                stage="V1b"
                description="券商帳戶與交割戶、逐筆買賣、手續費與交易稅、加權平均與 FIFO 成本、自動股價與股利。"
              />
            }
          />
          <Route
            path="loans"
            element={
              <ComingSoonPage
                title="貸款管理"
                stage="V1c"
                description="還款表、固定與浮動利率、自有與貸款資金分類、利息分攤，以及淨資產趨勢圖。"
              />
            }
          />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="reset-password" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AppDataProvider>
  );
}
