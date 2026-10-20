import { type FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

type Mode = 'login' | 'signup' | 'forgot';

const TITLES: Record<Mode, string> = { login: '登入', signup: '建立帳號', forgot: '重設密碼' };

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setInfo('已寄出確認信，請到信箱點擊連結完成註冊。');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setInfo('如果這個信箱已註冊，你會收到重設密碼的信。');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="card auth__card form" onSubmit={submit}>
        <h1>{TITLES[mode]}</h1>
        <label className="field">
          電子郵件
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== 'forgot' && (
          <label className="field">
            密碼
            <input
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {error && <p className="field__error" role="alert">{error}</p>}
        {info && <p className="notice" role="status">{info}</p>}
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? '處理中…' : TITLES[mode]}
        </button>
        <div className="auth__links">
          {mode !== 'login' && (
            <button type="button" className="link-button" onClick={() => setMode('login')}>
              回到登入
            </button>
          )}
          {mode === 'login' && (
            <>
              <button type="button" className="link-button" onClick={() => setMode('signup')}>
                建立帳號
              </button>
              <button type="button" className="link-button" onClick={() => setMode('forgot')}>
                忘記密碼
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
