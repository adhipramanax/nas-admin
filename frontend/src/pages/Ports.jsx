import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Network, Plus, Radar, Search, Trash2 } from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { Badge, Dot, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Spinner, toast } from '../components/ui.jsx';

function AddPort({ open, onClose, onSaved, projects }) {
  const [f, setF] = useState({ port: '', protocol: 'tcp', service: '', description: '', projectId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/ports', { method: 'POST', body: f });
      onSaved();
      onClose();
      setF({ port: '', protocol: 'tcp', service: '', description: '', projectId: '' });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Catat port manual" footer={<><button className="btn-ghost" onClick={onClose}>Batal</button><button className="btn-primary" form="port-form" disabled={busy}>{busy && <Spinner />}Simpan</button></>}>
      <form id="port-form" onSubmit={submit} className="space-y-3">
        <ErrorBox error={error} />
        <p className="text-xs text-slate-400">Port dari container Docker sudah terdeteksi otomatis. Catat di sini untuk layanan non-Docker (SSH, SMB, TrueNAS UI) atau port yang direncanakan.</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Port *"><input className="input" type="number" min="1" max="65535" value={f.port} onChange={set('port')} required /></Field>
          <Field label="Protokol"><select className="input" value={f.protocol} onChange={set('protocol')}><option>tcp</option><option>udp</option></select></Field>
          <Field label="Project">
            <select className="input" value={f.projectId} onChange={set('projectId')}>
              <option value="">— Sistem —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Layanan *"><input className="input" placeholder="SMB Share" value={f.service} onChange={set('service')} required /></Field>
        <Field label="Keterangan"><input className="input" value={f.description} onChange={set('description')} /></Field>
      </form>
    </Modal>
  );
}

export default function Ports() {
  const { data, error, loading, reload } = useApi('/ports', { interval: 30000 });
  const projects = useApi('/projects').data?.projects || [];
  const [q, setQ] = useState('');
  const [add, setAdd] = useState(false);
  const [listen, setListen] = useState({}); // port -> bool
  const [scanning, setScanning] = useState(false);
  const [free, setFree] = useState(null);
  const [freeFrom, setFreeFrom] = useState(8000);
  const [finding, setFinding] = useState(false);

  const list = useMemo(() => {
    const s = q.toLowerCase();
    return (data?.ports || []).filter(
      (p) => !s || String(p.port).includes(s) || [...p.docker.map((d) => d.container + (d.project?.name || '')), ...p.manual.map((m) => m.service)].some((v) => v.toLowerCase().includes(s))
    );
  }, [data, q]);

  const scan = async () => {
    setScanning(true);
    try {
      const r = await api('/ports/check', { method: 'POST', body: { ports: (data?.ports || []).filter((p) => p.protocol === 'tcp').map((p) => p.port) } });
      setListen(Object.fromEntries(r.results.map((x) => [x.port, x.open])));
    } finally {
      setScanning(false);
    }
  };
  const findFree = async () => {
    setFinding(true);
    try {
      setFree((await api(`/ports/free?from=${freeFrom}&count=5`)).ports);
    } finally {
      setFinding(false);
    }
  };
  const delManual = async (m) => {
    if (!confirm(`Hapus catatan port ${m.service}?`)) return;
    await api(`/ports/${m.id}`, { method: 'DELETE' });
    toast('Dihapus');
    reload();
  };

  if (loading && !data) return <Loading />;
  const conflicts = (data?.ports || []).filter((p) => p.conflict);

  return (
    <>
      <PageHeader title="Port" subtitle="Port dari Docker (otomatis) + port yang dicatat manual">
        <button className="btn-outline" onClick={scan} disabled={scanning}>{scanning ? <Spinner /> : <Radar className="h-4 w-4" />} Cek listen</button>
        <button className="btn-primary" onClick={() => setAdd(true)}><Plus className="h-4 w-4" /> Catat port</button>
      </PageHeader>
      <ErrorBox error={error} />

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="card flex flex-wrap items-end gap-2 p-4">
          <Field label="Cari port kosong mulai dari">
            <input className="input w-32" type="number" value={freeFrom} onChange={(e) => setFreeFrom(e.target.value)} />
          </Field>
          <button className="btn-outline" onClick={findFree} disabled={finding}>{finding && <Spinner />} Cari</button>
          {free && <div className="flex flex-wrap gap-1.5 pb-1.5">{free.length ? free.map((p) => <Badge key={p} tone="green">{p}</Badge>) : <span className="text-sm text-slate-500">Tidak ada</span>}</div>}
        </div>
        {conflicts.length > 0 ? (
          <div className="card border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
            <div className="mb-1 flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> {conflicts.length} port dipakai lebih dari satu pemilik</div>
            <div className="text-amber-100/80">{conflicts.map((c) => c.port).join(', ')}</div>
          </div>
        ) : (
          <div className="card p-4 text-sm text-slate-400">Tidak ada konflik port. ✓</div>
        )}
      </div>

      <div className="relative mb-3 max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
        <input className="input pl-9" placeholder="Cari port / layanan…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {list.length === 0 ? <Empty icon={Network} title="Belum ada port" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead className="border-b border-slate-800"><tr><th className="th w-24">Port</th><th className="th">Dipakai oleh</th><th className="th w-28">Sumber</th><th className="th w-28">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-800/60">
              {list.map((p) => (
                <tr key={`${p.port}/${p.protocol}`} className={p.conflict ? 'bg-amber-500/5' : 'hover:bg-slate-900/50'}>
                  <td className="td">
                    <a href={`http://${location.hostname}:${p.port}`} target="_blank" rel="noreferrer" className="font-mono font-semibold text-white hover:text-emerald-300">{p.port}</a>
                    <span className="ml-1 text-xs text-slate-500">/{p.protocol}</span>
                    {p.conflict && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-amber-400" />}
                  </td>
                  <td className="td">
                    <div className="space-y-1">
                      {p.docker.map((d) => (
                        <div key={d.container} className="flex flex-wrap items-center gap-1.5 text-xs">
                          <Dot state={d.state} />
                          <span className="font-mono text-slate-200">{d.container}</span>
                          <span className="text-slate-500">→ {d.privatePort}</span>
                          {d.project && <Link to={`/projects/${d.project.slug}`} className="text-emerald-400 hover:underline">{d.project.name}</Link>}
                        </div>
                      ))}
                      {p.manual.map((m) => (
                        <div key={m.id} className="group flex flex-wrap items-center gap-1.5 text-xs">
                          {(!m.project || m.service !== m.project.name) && <span className="text-slate-200">{m.service}</span>}
                          {m.project && <Link to={`/projects/${m.project.slug}`} className="text-emerald-400 hover:underline">{m.project.name}</Link>}
                          {m.description && <span className="text-slate-500">— {m.description}</span>}
                          <button className="opacity-0 transition group-hover:opacity-100" onClick={() => delManual(m)} title="Hapus"><Trash2 className="h-3 w-3 text-slate-500 hover:text-rose-400" /></button>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="td">
                    <Badge className="whitespace-nowrap" tone={p.source === 'manual' ? 'gray' : 'blue'}>{p.source === 'both' ? 'Docker + catatan' : p.source === 'docker' ? 'Docker' : 'Manual'}</Badge>
                  </td>
                  <td className="td text-xs">
                    {p.port in listen ? (
                      listen[p.port] ? <Badge tone="green">Listen</Badge> : <Badge tone="red">Tertutup</Badge>
                    ) : p.docker.length ? (
                      p.active ? <Badge tone="green">Aktif</Badge> : <Badge tone="red">Container mati</Badge>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AddPort open={add} onClose={() => setAdd(false)} onSaved={reload} projects={projects} />
    </>
  );
}
