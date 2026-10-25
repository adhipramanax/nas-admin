import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Edit3, ExternalLink, Eye, EyeOff, FileText, FolderOpen, GitBranch, Globe, KeyRound,
  Pencil, Plus, RefreshCw, Save, Trash2, XCircle,
} from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { CATEGORY_LABEL, dateTime, timeAgo } from '../lib/format.js';
import {
  Badge, CopyButton, Dot, Empty, ErrorBox, Field, HealthBadge, LiveBadge, Loading, Modal, Spinner, StatusBadge, toast,
} from '../components/ui.jsx';
import Markdown from '../components/Markdown.jsx';
import ProjectForm from '../components/ProjectForm.jsx';
import { ContainerActions } from '../components/ContainerTools.jsx';

function InfoRow({ icon: Icon, label, children, copy }) {
  if (!children) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
      <div className="w-28 shrink-0 text-xs text-slate-500">{label}</div>
      <div className="flex min-w-0 flex-1 items-center gap-1 break-all text-sm text-slate-200">
        {children}
        {copy && <CopyButton text={copy} />}
      </div>
    </div>
  );
}

function Url({ href }) {
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-400 hover:underline">{href}<ExternalLink className="h-3 w-3" /></a>;
}

// ===== Kredensial =====
function CredentialForm({ open, onClose, projectId, cred, onSaved }) {
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (open) {
      setF({ label: cred?.label || '', url: cred?.url || '', username: cred?.username || '', notes: cred?.notes || '', secret: '' });
      setError(null);
      setShow(false);
    }
  }, [open, cred]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...f };
      if (cred && !f.secret) delete body.secret; // password kosong saat edit = tidak diubah
      if (cred) await api(`/credentials/${cred.id}`, { method: 'PUT', body });
      else await api(`/projects/${projectId}/credentials`, { method: 'POST', body });
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={cred ? 'Edit akses' : 'Tambah akses admin'} footer={
      <><button className="btn-ghost" onClick={onClose}>Batal</button><button className="btn-primary" form="cred-form" disabled={busy}>{busy && <Spinner />}Simpan</button></>
    }>
      <form id="cred-form" onSubmit={submit} className="space-y-3">
        <ErrorBox error={error} />
        <Field label="Label *"><input className="input" placeholder="Admin panel / Database / Filament" value={f.label || ''} onChange={set('label')} required /></Field>
        <Field label="URL login"><input className="input" value={f.url || ''} onChange={set('url')} /></Field>
        <Field label="Username / email"><input className="input" autoComplete="off" value={f.username || ''} onChange={set('username')} /></Field>
        <Field label="Password" hint={cred ? (cred.hasSecret ? 'Kosongkan jika tidak ingin mengubah password.' : 'Belum ada password tersimpan.') : 'Disimpan terenkripsi AES-256-GCM.'}>
          <div className="relative">
            <input className="input pr-9" type={show ? 'text' : 'password'} autoComplete="new-password" value={f.secret || ''} onChange={set('secret')} />
            <button type="button" className="absolute right-2 top-2 text-slate-500" onClick={() => setShow(!show)}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
        </Field>
        <Field label="Catatan"><textarea className="input" rows={2} value={f.notes || ''} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  );
}

function SecretValue({ cred }) {
  const [secret, setSecret] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!secret) return;
    const t = setTimeout(() => setSecret(null), 30000); // sembunyikan otomatis
    return () => clearTimeout(t);
  }, [secret]);
  if (!cred.hasSecret) return <span className="text-slate-600">—</span>;
  const reveal = async () => {
    setBusy(true);
    try {
      setSecret((await api(`/credentials/${cred.id}/secret`)).secret);
    } catch (e) {
      toast(e.message, 'red');
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex items-center gap-1">
      <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs">{secret ?? '••••••••'}</code>
      {secret ? (
        <><CopyButton text={secret} /><button className="btn-ghost p-1 text-slate-400" onClick={() => setSecret(null)}><EyeOff className="h-3.5 w-3.5" /></button></>
      ) : (
        <button className="btn-ghost p-1 text-slate-400" onClick={reveal} title="Tampilkan">{busy ? <Spinner className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
      )}
    </span>
  );
}

function Credentials({ project, reload }) {
  const [edit, setEdit] = useState(null);
  const del = async (c) => {
    if (!confirm(`Hapus akses "${c.label}"?`)) return;
    await api(`/credentials/${c.id}`, { method: 'DELETE' });
    reload();
  };
  return (
    <section className="card">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><KeyRound className="h-4 w-4" /> Akses admin</h2>
        <button className="btn-ghost text-xs" onClick={() => setEdit({})}><Plus className="h-3.5 w-3.5" /> Tambah</button>
      </header>
      {project.credentials.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">Belum ada akses tersimpan.</p>
      ) : (
        <ul className="divide-y divide-slate-800">
          {project.credentials.map((c) => (
            <li key={c.id} className="px-4 py-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-100">{c.label}</span>
                <div className="ml-auto flex">
                  <button className="btn-ghost p-1 text-slate-400" onClick={() => setEdit(c)}><Pencil className="h-3.5 w-3.5" /></button>
                  <button className="btn-ghost p-1 text-slate-400 hover:text-rose-400" onClick={() => del(c)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <dl className="mt-1.5 grid grid-cols-[70px_1fr] gap-y-1 text-xs">
                {c.url && <><dt className="text-slate-500">URL</dt><dd className="truncate"><a className="text-emerald-400 hover:underline" href={c.url} target="_blank" rel="noreferrer">{c.url}</a></dd></>}
                {c.username && <><dt className="text-slate-500">User</dt><dd className="flex items-center gap-1 font-mono">{c.username}<CopyButton text={c.username} /></dd></>}
                <dt className="text-slate-500">Password</dt><dd><SecretValue cred={c} /></dd>
                {c.notes && <><dt className="text-slate-500">Catatan</dt><dd className="text-slate-400">{c.notes}</dd></>}
              </dl>
            </li>
          ))}
        </ul>
      )}
      <CredentialForm open={!!edit} cred={edit?.id ? edit : null} projectId={project.id} onClose={() => setEdit(null)} onSaved={reload} />
    </section>
  );
}

// ===== Dokumentasi Markdown =====
function Docs({ project, reload }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(project.docs || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!editing) setText(project.docs || ''); }, [project.docs, editing]);
  const save = async () => {
    setBusy(true);
    try {
      await api(`/projects/${project.id}`, { method: 'PUT', body: { docs: text } });
      toast('Dokumentasi tersimpan');
      setEditing(false);
      reload();
    } catch (e) {
      toast(e.message, 'red');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><FileText className="h-4 w-4" /> Dokumentasi</h2>
        {editing ? (
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setEditing(false)}>Batal</button>
            <button className="btn-primary" onClick={save} disabled={busy}>{busy ? <Spinner /> : <Save className="h-4 w-4" />} Simpan</button>
          </div>
        ) : (
          <button className="btn-ghost text-xs" onClick={() => setEditing(true)}><Edit3 className="h-3.5 w-3.5" /> Edit</button>
        )}
      </header>
      {editing ? (
        <div className="grid gap-0 lg:grid-cols-2">
          <textarea
            className="min-h-[420px] w-full resize-y border-0 border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200 outline-none lg:border-r"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'## Cara deploy\n\n```bash\ncd /mnt/data/app/web/...\ndocker compose up -d --build\n```\n\n## Environment\n- DATABASE_URL ...'}
          />
          <div className="hidden overflow-auto p-4 lg:block"><Markdown>{text}</Markdown></div>
        </div>
      ) : project.docs ? (
        <div className="p-4"><Markdown>{project.docs}</Markdown></div>
      ) : (
        <Empty icon={FileText} title="Dokumentasi masih kosong">Tulis cara deploy, environment, struktur folder, troubleshooting, dll. Mendukung Markdown — atau minta NAS Assistant membantu menulisnya.</Empty>
      )}
    </section>
  );
}

export default function ProjectDetail() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { refreshKey } = useOutletContext();
  const { data: p, error, loading, reload } = useApi(`/projects/${slug}`, { interval: 30000 });
  const [edit, setEdit] = useState(false);
  const [checking, setChecking] = useState(false);
  useEffect(() => { if (refreshKey) reload(); }, [refreshKey, reload]);

  if (loading && !p) return <Loading />;
  if (!p) return <ErrorBox error={error} />;

  const check = async () => {
    setChecking(true);
    try {
      const r = await api(`/projects/${p.id}/check`, { method: 'POST' });
      toast(r.ok ? `Online · HTTP ${r.status} · ${r.ms}ms` : `Down: ${r.error || r.status}`, r.ok ? 'green' : 'red');
      reload();
    } finally {
      setChecking(false);
    }
  };
  const del = async () => {
    if (!confirm(`Hapus dokumentasi "${p.name}"? Container tidak ikut terhapus.`)) return;
    await api(`/projects/${p.id}`, { method: 'DELETE' });
    nav('/projects');
  };

  const ports = [...new Set([...p.live.publishedPorts, ...p.ports.map((x) => x.port)])].sort((a, b) => a - b);

  return (
    <>
      <Link to="/projects" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Project</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-white">{p.name}</h1>
            <StatusBadge status={p.status} />
            <LiveBadge live={p.live} />
            <HealthBadge health={p.live.health} />
          </div>
          {p.description && <p className="mt-1 text-sm text-slate-400">{p.description}</p>}
          {p.tags?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{p.tags.map((t) => <Badge key={t}>#{t}</Badge>)}</div>}
        </div>
        <div className="flex gap-2">
          {p.healthUrl && <button className="btn-outline" onClick={check} disabled={checking}>{checking ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Cek web</button>}
          <button className="btn-outline" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> Edit</button>
          <button className="btn-ghost text-rose-400" onClick={del} title="Hapus"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="card divide-y divide-slate-800/70 px-4">
            <InfoRow icon={FileText} label="Kategori">{CATEGORY_LABEL[p.category]}{p.stack && <span className="text-slate-400"> · {p.stack}</span>}</InfoRow>
            <InfoRow icon={FolderOpen} label="Lokasi" copy={p.location}>
              {p.location && (
                <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                  {p.location}
                  {p.locationExists === true && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" title="Folder ditemukan" />}
                  {p.locationExists === false && <span className="inline-flex items-center gap-1 text-rose-400"><XCircle className="h-3.5 w-3.5" />tidak ditemukan</span>}
                </span>
              )}
            </InfoRow>
            <InfoRow icon={GitBranch} label="Repository">{p.repoUrl && <><Url href={p.repoUrl} />{p.branch && <Badge className="ml-2">{p.branch}</Badge>}</>}</InfoRow>
            <InfoRow icon={Globe} label="URL lokal">{p.localUrl && <Url href={p.localUrl} />}</InfoRow>
            <InfoRow icon={Globe} label="URL publik">{p.publicUrl && <Url href={p.publicUrl} />}</InfoRow>
            <InfoRow icon={RefreshCw} label="Health check">
              {p.healthUrl && <span className="font-mono text-xs">{p.healthUrl}{p.live.health && <span className="ml-2 text-slate-500">· dicek {timeAgo(p.live.health.checkedAt)}</span>}</span>}
            </InfoRow>
            {p.notes && <div className="py-3 text-sm text-slate-300 whitespace-pre-wrap">{p.notes}</div>}
          </section>

          <Docs project={p} reload={reload} />
        </div>

        <div className="space-y-5">
          <section className="card">
            <header className="border-b border-slate-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">Container</h2>
              <p className="text-xs text-slate-500">{p.composeProject ? <>compose: <code>{p.composeProject}</code></> : 'Belum ditautkan ke compose project'}</p>
            </header>
            {p.live.containers.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Tidak ada container tertaut. Isi “Docker compose project” lewat Edit.</p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {p.live.containers.map((c) => (
                  <li key={c.name} className="flex items-center gap-2 px-4 py-2.5">
                    <Dot state={c.state} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs text-slate-200">{c.name}</div>
                      <div className="text-[11px] text-slate-500">{c.status}</div>
                    </div>
                    <ContainerActions container={c} onDone={reload} compact />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold text-white">Port</h2>
            {ports.length === 0 ? <p className="text-sm text-slate-500">Belum ada port.</p> : (
              <div className="flex flex-wrap gap-1.5">
                {ports.map((x) => <a key={x} href={`http://${location.hostname}:${x}`} target="_blank" rel="noreferrer"><Badge tone="blue">:{x}</Badge></a>)}
              </div>
            )}
          </section>

          <Credentials project={p} reload={reload} />

          <p className="px-1 text-xs text-slate-600">Dibuat {dateTime(p.createdAt)} · diubah {timeAgo(p.updatedAt)}</p>
        </div>
      </div>

      <ProjectForm open={edit} project={p} onClose={() => setEdit(false)} onSaved={(s) => (s.slug !== slug ? nav(`/projects/${s.slug}`, { replace: true }) : reload())} />
    </>
  );
}
