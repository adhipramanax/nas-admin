import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, Lock, Search } from 'lucide-react';
import { useApi } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { Badge, Dot, Empty, ErrorBox, Loading, PageHeader } from '../components/ui.jsx';
import { ContainerActions } from '../components/ContainerTools.jsx';

export default function Containers() {
  const { data, error, loading, reload } = useApi('/docker/containers', { interval: 15000 });
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [group, setGroup] = useState(true);

  const list = useMemo(() => {
    const s = q.toLowerCase();
    return (data?.containers || []).filter(
      (c) =>
        (!state || (state === 'running' ? c.state === 'running' : c.state !== 'running')) &&
        (!s || [c.name, c.image, c.composeProject, c.project?.name].some((v) => v?.toLowerCase().includes(s)))
    );
  }, [data, q, state]);

  const groups = useMemo(() => {
    if (!group) return [['', list]];
    const m = new Map();
    for (const c of list) {
      const k = c.composeProject || '(tanpa compose)';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(c);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [list, group]);

  if (loading && !data) return <Loading />;
  const all = data?.containers || [];
  const running = all.filter((c) => c.state === 'running').length;

  return (
    <>
      <PageHeader title="Container" subtitle={`${running} running dari ${all.length} container · auto refresh 15 detik`} />
      <ErrorBox error={error || (data && !data.ok && { message: `Docker tidak terhubung: ${data.error}` })} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input className="input pl-9" placeholder="Cari nama, image, compose…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-auto" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">Semua</option>
          <option value="running">Running</option>
          <option value="stopped">Tidak running</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-400"><input type="checkbox" className="accent-emerald-500" checked={group} onChange={(e) => setGroup(e.target.checked)} /> Kelompokkan per compose</label>
      </div>

      {list.length === 0 ? <Empty icon={Boxes} title="Tidak ada container" /> : (
        <div className="space-y-4">
          {groups.map(([name, items]) => (
            <div key={name || 'all'} className="card overflow-hidden">
              {name && (
                <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900/80 px-3 py-2 text-xs">
                  <span className="font-mono font-semibold text-slate-200">{name}</span>
                  <span className="text-slate-500">{items.filter((c) => c.state === 'running').length}/{items.length} running</span>
                  {items[0].project && <Link to={`/projects/${items[0].project.slug}`} className="ml-auto text-emerald-400 hover:underline">{items[0].project.name} →</Link>}
                  {!items[0].project && !items[0].protected && <Badge tone="amber" className="ml-auto">Belum terdokumentasi</Badge>}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead className="border-b border-slate-800/70">
                    <tr><th className="th">Nama</th><th className="th">Image</th><th className="th">Status</th><th className="th">Port</th><th className="th w-32 text-right">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {items.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-900/50">
                        <td className="td">
                          <div className="flex items-center gap-2">
                            <Dot state={c.state} />
                            <span className="font-mono text-xs text-slate-100">{c.name}</span>
                            {c.protected && <Lock className="h-3 w-3 text-slate-500" title="Dilindungi" />}
                          </div>
                          {!group && c.project && <Link to={`/projects/${c.project.slug}`} className="ml-4 text-xs text-emerald-400 hover:underline">{c.project.name}</Link>}
                        </td>
                        <td className="td max-w-[240px] truncate font-mono text-xs text-slate-400" title={c.image}>{c.image}</td>
                        <td className="td text-xs">
                          <div className={c.state === 'running' ? 'text-slate-300' : 'text-rose-300'}>{c.status}</div>
                          {c.health && <Badge tone={c.health === 'healthy' ? 'green' : c.health === 'unhealthy' ? 'red' : 'amber'}>{c.health}</Badge>}
                          <div className="text-[11px] text-slate-600">dibuat {timeAgo(c.created)}</div>
                        </td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1">
                            {c.ports.filter((p) => p.public).map((p) => (
                              <a key={`${p.public}${p.type}`} href={`http://${location.hostname}:${p.public}`} target="_blank" rel="noreferrer">
                                <Badge tone="blue">{p.public}→{p.private}{p.type === 'udp' ? '/udp' : ''}</Badge>
                              </a>
                            ))}
                            {c.ports.filter((p) => !p.public).length > 0 && <span className="text-[11px] text-slate-600">internal: {c.ports.filter((p) => !p.public).map((p) => p.private).join(', ')}</span>}
                          </div>
                        </td>
                        <td className="td"><div className="flex justify-end"><ContainerActions container={c} onDone={reload} compact /></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
