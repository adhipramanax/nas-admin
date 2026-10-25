import { useState } from 'react';
import { Server } from 'lucide-react';
import { api } from '../lib/api.js';
import { ErrorBox, Spinner } from '../components/ui.jsx';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const d = await api('/auth/login', { method: 'POST', body: { username, password } });
      onLogin(d.user);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.12),_transparent_60%)] p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400"><Server className="h-5 w-5" /></div>
          <div>
            <h1 className="font-semibold text-white">NAS Admin</h1>
            <p className="text-xs text-slate-400">Dokumentasi & monitoring TrueNAS</p>
          </div>
        </div>
        <ErrorBox error={error} />
        <label className="block">
          <span className="label">Username</span>
          <input className="input" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn-primary w-full py-2" disabled={busy}>{busy && <Spinner />} Masuk</button>
      </form>
    </div>
  );
}
