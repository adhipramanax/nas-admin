import { useState } from 'react';
import { ArrowLeft, Server, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { ErrorBox, Spinner } from '../components/ui.jsx';

function CodeStep({ onLogin, onBack }) {
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e, value = code) => {
    e?.preventDefault();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const d = await api('/auth/login/2fa', { method: 'POST', body: { code: value } });
      onLogin(d.user);
    } catch (err) {
      if (err.message.includes('login ulang')) return onBack(err.message);
      setError(err);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const onChange = (e) => {
    if (recovery) return setCode(e.target.value);
    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(v);
    if (v.length === 6) submit(null, v); // kirim otomatis setelah 6 digit
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-300">
        <ShieldCheck className="h-5 w-5 text-emerald-400" />
        {recovery ? 'Masukkan salah satu kode cadangan' : 'Masukkan kode 6 digit dari Google Authenticator'}
      </div>
      <ErrorBox error={error} />
      <input
        className={recovery ? 'input font-mono' : 'input text-center font-mono text-2xl tracking-[0.5em]'}
        autoFocus
        inputMode={recovery ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        placeholder={recovery ? 'xxxxx-xxxxx' : '000000'}
        value={code}
        onChange={onChange}
        disabled={busy}
      />
      <button className="btn-primary w-full py-2" disabled={busy || !code}>{busy && <Spinner />} Verifikasi</button>
      <div className="flex items-center justify-between text-xs">
        <button type="button" className="inline-flex items-center gap-1 text-slate-400 hover:text-white" onClick={() => onBack()}>
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </button>
        <button type="button" className="text-emerald-400 hover:underline" onClick={() => { setRecovery(!recovery); setCode(''); setError(null); }}>
          {recovery ? 'Pakai kode authenticator' : 'Pakai kode cadangan'}
        </button>
      </div>
    </form>
  );
}

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [needCode, setNeedCode] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const d = await api('/auth/login', { method: 'POST', body: { username, password } });
      if (d.twoFactorRequired) {
        setNeedCode(true);
        setPassword('');
      } else onLogin(d.user);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.12),_transparent_60%)] p-4">
      <div className="card w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400"><Server className="h-5 w-5" /></div>
          <div>
            <h1 className="font-semibold text-white">NAS Admin</h1>
            <p className="text-xs text-slate-400">{needCode ? 'Verifikasi 2 langkah' : 'Dokumentasi & monitoring TrueNAS'}</p>
          </div>
        </div>
        {needCode ? (
          <CodeStep
            onLogin={onLogin}
            onBack={(msg) => { setNeedCode(false); setError(msg ? { message: msg } : null); }}
          />
        ) : (
          <form onSubmit={submit} className="space-y-4">
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
        )}
      </div>
    </div>
  );
}
