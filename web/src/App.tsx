import { RouterProvider, createBrowserRouter } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { AppDataProvider } from './hooks/useAppData';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';

// 所有網址都交給 AppLayout，由它依 pageRoutes 渲染目前頁面與上層頁面
const router = createBrowserRouter([{ path: '*', element: <AppLayout /> }]);

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
