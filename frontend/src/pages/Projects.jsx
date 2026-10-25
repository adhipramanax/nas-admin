import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ExternalLink, FolderKanban, FolderOpen, KeyRound, Pin, Plus, Search, Wand2 } from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { CATEGORIES, CATEGORY_LABEL, STATUSES, STATUS_LABEL } from '../lib/format.js';
import { Badge, Empty, ErrorBox, HealthBadge, LiveBadge, Loading, Modal, PageHeader, StatusBadge } from '../components/ui.jsx';
import ProjectForm from '../components/ProjectForm.jsx';

function DiscoverModal({ open, onClose, onPick }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (open) api('/docker/discover').then(setData).catch((e) => setData({ error: e.message }));
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Import dari Docker" wide>
      <p className="mb-3 text-sm text-slate-400">Container yang berjalan di NAS tetapi belum punya dokumentasi. Pilih untuk membuat project dengan data terisi otomatis.</p>
      {!data ? <Loading /> : data.error ? <ErrorBox error={data} /> : data.suggestions.length === 0 ? (
        <Empty icon={FolderKanban} title="Semua container sudah terdokumentasi 🎉" />
      ) : (
        <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800">
          {data.suggestions.map((s) => (
            <li key={s.key} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-white">{s.key}</div>
                <div className="mt-0.5 truncate font-mono text-xs text-slate-500">{s.workingDir || s.containers.map((c) => c.image).join(', ')}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.containers.map((c) => <Badge key={c.name} tone={c.state === 'running' ? 'green' : 'red'}>{c.name}</Badge>)}
                  {s.ports.map((p) => <Badge key={p} tone="blue">:{p}</Badge>)}
                </div>
              </div>
              <button className="btn-outline" onClick={() => onPick(s)}><Plus className="h-4 w-4" /> Dokumentasikan</button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export default function Projects() {
  const { refreshKey } = useOutletContext();
  const { data, error, loading, reload } = useApi('/projects', { interval: 30000 });
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState(null); // { initial } | null
  const [discover, setDiscover] = useState(false);
  useEffect(() => { if (refreshKey) reload(); }, [refreshKey, reload]);

  const list = useMemo(() => {
    const s = q.toLowerCase();
    return (data?.projects || []).filter(
      (p) =>
        (!cat || p.category === cat) &&
        (!status || p.status === status) &&
        (!s || [p.name, p.description, p.stack, p.location, ...(p.tags || [])].some((v) => v?.toLowerCase().includes(s)))
    );
  }, [data, q, cat, status]);

  const pickSuggestion = (s) => {
    setDiscover(false);
    const port = s.ports[0];
    setForm({
      initial: {
        name: s.key,
        composeProject: s.composeProject || '',
        containers: s.composeProject ? [] : s.containers.map((c) => c.name),
        location: s.workingDir || '',
        localUrl: port ? `http://${location.hostname}:${port}` : '',
        healthUrl: port ? `http://host.docker.internal:${port}` : '',
        stack: s.containers.map((c) => c.image.split(':')[0]).join(', '),
      },
    });
  };

  if (loading && !data) return <Loading />;

  return (
    <>
      <PageHeader title="Project" subtitle="Dokumentasi semua project & layanan di NAS">
        <button className="btn-outline" onClick={() => setDiscover(true)}><Wand2 className="h-4 w-4" /> Import dari Docker</button>
        <button className="btn-primary" onClick={() => setForm({})}><Plus className="h-4 w-4" /> Project baru</button>
      </PageHeader>
      <ErrorBox error={error} />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input className="input pl-9" placeholder="Cari nama, stack, lokasi, tag…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Semua kategori</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      {list.length === 0 ? (
        <Empty icon={FolderKanban} title="Belum ada project">Tambahkan manual atau import dari container Docker yang sedang berjalan.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            const ports = [...new Set([...p.live.publishedPorts, ...p.ports.map((x) => x.port)])].sort((a, b) => a - b);
            return (
              <Link key={p.id} to={`/projects/${p.slug}`} className="card group flex flex-col p-4 transition hover:border-slate-700 hover:bg-slate-900">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {p.pinned && <Pin className="h-3.5 w-3.5 text-emerald-400" />}
                      <h3 className="truncate font-semibold text-white group-hover:text-emerald-300">{p.name}</h3>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">{CATEGORY_LABEL[p.category]}{p.stack ? ` · ${p.stack}` : ''}</div>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                {p.description && <p className="mt-2 line-clamp-2 text-sm text-slate-400">{p.description}</p>}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <LiveBadge live={p.live} />
                  <HealthBadge health={p.live.health} />
                  {ports.map((x) => <Badge key={x} tone="blue">:{x}</Badge>)}
                  {p.credentialCount > 0 && <Badge tone="violet"><KeyRound className="h-3 w-3" />{p.credentialCount}</Badge>}
                </div>
                <div className="mt-auto flex items-center gap-3 pt-3 text-xs text-slate-500">
                  {p.location && <span className="flex min-w-0 items-center gap-1 truncate font-mono"><FolderOpen className="h-3.5 w-3.5 shrink-0" />{p.location}</span>}
                  {(p.publicUrl || p.localUrl) && (
                    <span role="link" tabIndex={0} onClick={(e) => { e.preventDefault(); window.open(p.publicUrl || p.localUrl, '_blank'); }} className="ml-auto flex shrink-0 items-center gap-1 hover:text-white">
                      Buka <ExternalLink className="h-3 w-3" />
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <ProjectForm open={!!form} initial={form?.initial} onClose={() => setForm(null)} onSaved={reload} />
      <DiscoverModal open={discover} onClose={() => setDiscover(false)} onPick={pickSuggestion} />
    </>
  );
}
