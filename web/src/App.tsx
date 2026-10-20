import { IonApp, IonContent, IonPage } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { AppTabs } from './components/AppTabs';
import { AppDataProvider } from './hooks/useAppData';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';

export function App() {
  const { session, loading, recovering } = useAuth();

  return (
    <IonApp>
      <IonReactRouter>
        {loading ? (
          <IonPage>
            <IonContent>
              <p className="page-message">載入中…</p>
            </IonContent>
          </IonPage>
        ) : recovering ? (
          <ResetPasswordPage />
        ) : !session ? (
          <LoginPage />
        ) : (
          // key 讓換帳號登入時重新載入資料
          <AppDataProvider key={session.user.id}>
            <AppTabs />
          </AppDataProvider>
        )}
      </IonReactRouter>
    </IonApp>
  );
}
