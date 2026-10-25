import { useEffect, useState } from 'react';
import { Bot, Download, KeyRound, Server } from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { dateTime } from '../lib/format.js';
import { Badge, Dot, ErrorBox, Field, Loading, PageHeader, Spinner, toast } from '../components/ui.jsx';

function PasswordForm() {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    if (f.newPassword !== f.confirm) return setError({ message: 'Konfirmasi password tidak sama' });
    setBusy(true);
    setError(null);
    try {
      await api('/auth/password', { method: 'POST', body: f });
      toast('Password berhasil diubah');
      setF({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><KeyRound className="h-4 w-4" /> Ganti password login</h2>
      <ErrorBox error={error} />
      <Field label="Password lama"><input className="input" type="password" value={f.currentPassword} onChange={set('currentPassword')} /></Field>
      <Field label="Password baru (min. 8 karakter)"><input className="input" type="password" value={f.newPassword} onChange={set('newPassword')} /></Field>
      <Field label="Ulangi password baru"><input className="input" type="password" value={f.confirm} onChange={set('confirm')} /></Field>
      <button className="btn-primary" disabled={busy}>{busy && <Spinner />} Simpan</button>
    </form>
  );
}

function AiSettings({ settings, reload }) {
  const [url, setUrl] = useState(settings.ollamaUrl);
  const [model, setModel] = useState(settings.ollamaModel);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const loadStatus = () => api('/agent/status').then(setStatus).catch(() => setStatus({ ok: false }));
  useEffect(() => { loadStatus(); }, []);
  const save = async () => {
    setBusy(true);
    try {
      await api('/system/settings', { method: 'PUT', body: { ollamaUrl: url, ollamaModel: model } });
      toast('Pengaturan AI disimpan');
      reload();
      loadStatus();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Bot className="h-4 w-4" /> NAS Assistant (Ollama)</h2>
      <div className="flex items-center gap-2 text-sm">
        {status === null ? <Spinner /> : (
          <Badge tone={status.ok ? 'green' : 'red'}><Dot state={status.ok ? 'running' : 'stopped'} />{status.ok ? `Terhubung · ${status.models.length} model` : `Tidak terhubung${status.error ? ` (${status.error})` : ''}`}</Badge>
        )}
      </div>
      <Field label="Ollama URL" hint="Dari dalam container. Jika Ollama app TrueNAS, biasanya http://host.docker.internal:<port>">
        <input className="input font-mono" value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Field label="Model" hint="Harus mendukung tool-calling: qwen2.5:7b (disarankan), llama3.1:8b, mistral-nemo">
        {status?.models?.length ? (
          <select className="input font-mono" value={model} onChange={(e) => setModel(e.target.value)}>
            {!status.models.includes(model) && <option value={model}>{model} (belum di-pull)</option>}
            {status.models.map((m) => <option key={m}>{m}</option>)}
          </select>
        ) : (
          <input className="input font-mono" value={model} onChange={(e) => setModel(e.target.value)} />
        )}
      </Field>
      <button className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner />} Simpan</button>
    </div>
  );
}

export default function SettingsPage() {
  const { data, error, loading, reload } = useApi('/system/settings');
  const activity = useApi('/system/activity?take=50').data || [];
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;
  return (
    <>
      <PageHeader title="Pengaturan" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <AiSettings settings={data} reload={reload} />
          <PasswordForm />
        </div>
        <div className="space-y-5">
          <div className="card space-y-3 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Download className="h-4 w-4" /> Export dokumentasi</h2>
            <p className="text-xs text-slate-400">Simpan cadangan dokumentasi. Markdown tidak berisi password; JSON berisi password terenkripsi (hanya bisa dibuka dengan ENCRYPTION_KEY yang sama).</p>
            <div className="flex gap-2">
              <a className="btn-outline" href="/api/system/export/markdown">Markdown (.md)</a>
              <a className="btn-outline" href="/api/system/export/json">Backup (.json)</a>
            </div>
          </div>
          <div className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Server className="h-4 w-4" /> Konfigurasi server</h2>
            <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-xs">
              <dt className="text-slate-500">Docker host</dt><dd className="font-mono text-slate-300">{data.dockerHost}</dd>
              <dt className="text-slate-500">Cek port ke</dt><dd className="font-mono text-slate-300">{data.hostCheckAddr}</dd>
              <dt className="text-slate-500">Mount</dt><dd className="font-mono text-slate-300">{data.hostMounts.map((m) => `${m.hostPath} → ${m.containerPath}`).join(', ')}</dd>
              <dt className="text-slate-500">Health check</dt><dd className="text-slate-300">setiap {data.healthInterval} detik</dd>
            </dl>
            <p className="mt-3 text-xs text-slate-500">Diubah lewat file <code>.env</code> lalu <code>docker compose up -d</code>.</p>
          </div>
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">Riwayat aktivitas</h2>
            <ul className="max-h-80 space-y-1.5 overflow-y-auto text-xs">
              {activity.map((a) => (
                <li key={a.id} className="flex gap-2">
                  <span className="w-28 shrink-0 text-slate-600">{dateTime(a.createdAt)}</span>
                  <Badge tone={a.actor === 'ai' ? 'violet' : 'gray'}>{a.actor === 'ai' ? 'AI' : 'User'}</Badge>
                  <span className={a.success ? 'text-slate-300' : 'text-rose-300'}>{a.action} <span className="text-slate-400">{a.target}</span>{a.detail && <span className="block text-slate-500">{a.detail}</span>}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
