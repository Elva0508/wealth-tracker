import { IonContent, IonPage } from '@ionic/react';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

/** 從「重設密碼」信件點進來後，在這裡設定新密碼 */
export function ResetPasswordPage() {
  const { finishRecovery } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('兩次輸入的密碼不同');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    finishRecovery();
    navigate('/overview', { replace: true });
  }

  return (
    <IonPage>
      <IonContent>
        <div className="auth">
          <form className="card auth__card form" onSubmit={submit}>
            <h1>設定新密碼</h1>
            <label className="field">
              新密碼
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="field">
              再輸入一次
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            {error && (
              <p className="field__error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? '儲存中…' : '儲存新密碼'}
            </button>
          </form>
        </div>
      </IonContent>
    </IonPage>
  );
}
