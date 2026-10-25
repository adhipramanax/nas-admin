import { useEffect, useState } from 'react';
import { Download, ShieldCheck, ShieldOff } from 'lucide-react';
import { api } from '../lib/api.js';
import { Badge, CopyButton, ErrorBox, Field, Modal, Spinner, toast } from './ui.jsx';

function RecoveryCodes({ codes, onDone }) {
  const text = codes.join('\n');
  const download = () => {
    const blob = new Blob([`Kode cadangan NAS Admin\nSetiap kode hanya bisa dipakai sekali.\n\n${text}\n`], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nas-admin-kode-cadangan.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
        Simpan kode cadangan ini di tempat aman (password manager / dicetak). Pakai jika HP hilang. <b>Setiap kode hanya berlaku sekali</b> dan tidak akan ditampilkan lagi.
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-950 p-3 font-mono text-sm text-slate-100 ring-1 ring-slate-800">
        {codes.map((c) => <div key={c}>{c}</div>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={text} className="btn-outline px-3 py-1.5 text-slate-200" label="Salin" />
        <button className="btn-outline" onClick={download}><Download className="h-4 w-4" /> Unduh .txt</button>
        <button className="btn-primary ml-auto" onClick={onDone}>Sudah saya simpan</button>
      </div>
    </div>
  );
}

function SetupModal({ open, onClose, onEnabled }) {
  const [data, setData] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState(null);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setCode('');
    setError(null);
    setCodes(null);
    api('/auth/2fa/setup', { method: 'POST' }).then(setData).catch(setError);
  }, [open]);

  const enable = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api('/auth/2fa/enable', { method: 'POST', body: { code } });
      setCodes(r.recoveryCodes);
      onEnabled();
    } catch (err) {
      setError(err);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={codes ? 'Kode cadangan' : 'Aktifkan Google Authenticator'}>
      {codes ? (
        <RecoveryCodes codes={codes} onDone={onClose} />
      ) : !data ? (
        error ? <ErrorBox error={error} /> : <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <form onSubmit={enable} className="space-y-4 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-slate-300">
            <li>Buka <b>Google Authenticator</b> di HP → tombol <b>+</b> → <b>Pindai kode QR</b>.</li>
            <li>Scan kode QR di bawah.</li>
            <li>Masukkan kode 6 digit yang muncul untuk konfirmasi.</li>
          </ol>
          <div className="flex justify-center">
            <img src={data.qr} alt="QR Google Authenticator" className="h-52 w-52 rounded-lg bg-white p-2" />
          </div>
          <div className="text-center text-xs text-slate-400">
            Tidak bisa scan? Pilih <b>Masukkan kunci penyiapan</b> dan ketik:
            <div className="mt-1 flex items-center justify-center gap-1">
              <code className="rounded bg-slate-800 px-2 py-1 font-mono text-sm text-slate-100">{data.secret}</code>
              <CopyButton text={data.secret.replace(/\s/g, '')} />
            </div>
          </div>
          <ErrorBox error={error} />
          <Field label="Kode 6 digit">
            <input
              className="input text-center font-mono text-xl tracking-[0.4em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoFocus
            />
          </Field>
          <button className="btn-primary w-full" disabled={busy || code.length !== 6}>{busy && <Spinner />} Aktifkan</button>
        </form>
      )}
    </Modal>
  );
}

function CodeConfirmModal({ open, mode, onClose, onDone }) {
  // mode: 'disable' | 'regenerate'
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState(null);
  useEffect(() => {
    if (open) { setPassword(''); setCode(''); setError(null); setCodes(null); }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'disable') {
        await api('/auth/2fa/disable', { method: 'POST', body: { password, code } });
        toast('Verifikasi 2 langkah dinonaktifkan');
        onDone();
        onClose();
      } else {
        const r = await api('/auth/2fa/recovery-codes', { method: 'POST', body: { code } });
        setCodes(r.recoveryCodes);
        onDone();
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={mode === 'disable' ? 'Nonaktifkan verifikasi 2 langkah' : 'Buat ulang kode cadangan'}>
      {codes ? (
        <RecoveryCodes codes={codes} onDone={onClose} />
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <ErrorBox error={error} />
          {mode === 'disable' && (
            <Field label="Password login"><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></Field>
          )}
          <Field label="Kode 6 digit atau kode cadangan">
            <input className="input font-mono" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus={mode !== 'disable'} />
          </Field>
          {mode === 'regenerate' && <p className="text-xs text-slate-400">Semua kode cadangan lama akan diganti.</p>}
          <button className={mode === 'disable' ? 'btn-danger w-full' : 'btn-primary w-full'} disabled={busy || !code}>
            {busy && <Spinner />} {mode === 'disable' ? 'Nonaktifkan' : 'Buat ulang'}
          </button>
        </form>
      )}
    </Modal>
  );
}

export default function TwoFactorCard() {
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const load = () => api('/auth/2fa').then(setStatus).catch(() => {});
  useEffect(() => { load(); }, []);

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck className="h-4 w-4" /> Verifikasi 2 langkah</h2>
        {status && <Badge tone={status.enabled ? 'green' : 'gray'}>{status.enabled ? 'Aktif' : 'Nonaktif'}</Badge>}
      </div>
      <p className="text-xs text-slate-400">
        Setelah password, login juga meminta kode 6 digit dari Google Authenticator (atau Microsoft Authenticator / Authy). Kodenya dibuat di HP dan tidak butuh internet.
      </p>
      {!status ? <Spinner /> : status.enabled ? (
        <>
          <div className={`text-xs ${status.recoveryCodesLeft <= 3 ? 'text-amber-300' : 'text-slate-400'}`}>
            Sisa kode cadangan: <b>{status.recoveryCodesLeft}</b>{status.recoveryCodesLeft <= 3 && ' — sebaiknya buat ulang'}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline" onClick={() => setConfirm('regenerate')}>Buat ulang kode cadangan</button>
            <button className="btn-ghost text-rose-400" onClick={() => setConfirm('disable')}><ShieldOff className="h-4 w-4" /> Nonaktifkan</button>
          </div>
        </>
      ) : (
        <button className="btn-primary" onClick={() => setSetup(true)}><ShieldCheck className="h-4 w-4" /> Aktifkan</button>
      )}
      <SetupModal open={setup} onClose={() => setSetup(false)} onEnabled={load} />
      <CodeConfirmModal open={!!confirm} mode={confirm} onClose={() => setConfirm(null)} onDone={load} />
    </div>
  );
}
