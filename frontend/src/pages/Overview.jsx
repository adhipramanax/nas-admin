import { Link, useOutletContext } from 'react-router-dom';
import { Activity, AlertTriangle, Boxes, Cpu, ExternalLink, FolderKanban, Globe, HardDrive, Network, Sparkles } from 'lucide-react';
import { useApi } from '../lib/api.js';
import { bytes, timeAgo } from '../lib/format.js';
import { Badge, Dot, ErrorBox, HealthBadge, LiveBadge, Loading, PageHeader, Stat, StatusBadge, cx } from '../components/ui.jsx';
import { useEffect } from 'react';

export default function Overview() {
  const { refreshKey, openAgent } = useOutletContext();
  const { data, error, loading, reload } = useApi('/system/overview', { interval: 30000 });
  useEffect(() => { if (refreshKey) reload(); }, [refreshKey, reload]);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;
  const { counts, docker, disks, projects, activity } = data;
  const info = docker.info;
  const down = projects.filter((p) => p.live.health && !p.live.health.ok);
  const stopped = projects.filter((p) => p.live.state === 'stopped' || p.live.state === 'partial');

  return (
    <>
      <PageHeader title="Ringkasan NAS" subtitle={`${info?.name || 'TrueNAS'} · ${data.nasLanIp}`}>
        <Badge tone={docker.ok ? 'green' : 'red'}><Dot state={docker.ok ? 'running' : 'stopped'} />Docker {docker.ok ? 'terhubung' : 'terputus'}</Badge>
      </PageHeader>

      {!docker.ok && <div className="mb-4"><ErrorBox error={{ message: `Docker tidak terhubung: ${docker.error}. Status container tidak tersedia.` }} /></div>}

      {(down.length > 0 || stopped.length > 0 || counts.portConflicts > 0) && (
        <div className="card mb-5 border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-200"><AlertTriangle className="h-4 w-4" /> Perlu perhatian</div>
          <ul className="space-y-1 text-sm text-slate-300">
            {down.map((p) => <li key={`d${p.id}`}>• Web <Link className="text-white underline-offset-2 hover:underline" to={`/projects/${p.slug}`}>{p.name}</Link> tidak bisa diakses ({p.live.health.error || `HTTP ${p.live.health.status}`})</li>)}
            {stopped.map((p) => <li key={`s${p.id}`}>• Container <Link className="text-white hover:underline" to={`/projects/${p.slug}`}>{p.name}</Link> {p.live.state === 'partial' ? 'sebagian' : ''} mati ({p.live.running}/{p.live.total})</li>)}
            {counts.portConflicts > 0 && <li>• {counts.portConflicts} <Link className="text-white hover:underline" to="/ports">konflik port</Link></li>}
          </ul>
          <button className="btn-outline mt-3" onClick={openAgent}><Sparkles className="h-4 w-4" /> Minta AI menganalisis</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={FolderKanban} label="Project" value={counts.projects} sub={`${counts.byStatus.aktif || 0} aktif · ${counts.byStatus.development || 0} dev`} />
        <Stat icon={Boxes} label="Container running" value={`${counts.running}/${counts.containers}`} tone={counts.running < counts.containers ? 'text-amber-300' : 'text-emerald-300'} sub={counts.undocumented ? `${counts.undocumented} belum terdokumentasi` : 'Semua terdokumentasi'} />
        <Stat icon={Globe} label="Web online" value={`${counts.healthUp}/${counts.healthUp + counts.healthDown}`} tone={counts.healthDown ? 'text-rose-300' : 'text-emerald-300'} sub="Health check otomatis" />
        <Stat icon={Network} label="Port terpakai" value={counts.ports} sub={counts.portConflicts ? `${counts.portConflicts} konflik` : 'Tanpa konflik'} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Status layanan</h2>
            <Link to="/projects" className="text-xs text-emerald-400 hover:underline">Semua project →</Link>
          </header>
          <ul className="divide-y divide-slate-800/70">
            {projects.map((p) => (
              <li key={p.id} className="flex flex-col gap-1.5 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Dot state={p.live.state} />
                  <Link to={`/projects/${p.slug}`} className="truncate text-sm font-medium text-slate-100 hover:text-emerald-300">{p.name}</Link>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pl-5 sm:pl-0">
                  <StatusBadge status={p.status} />
                  <LiveBadge live={p.live} />
                  <HealthBadge health={p.live.health} />
                  {(p.publicUrl || p.localUrl) && (
                    <a href={p.publicUrl || p.localUrl} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-white" title="Buka"><ExternalLink className="h-4 w-4" /></a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-5">
          <section className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><HardDrive className="h-4 w-4" /> Penyimpanan</h2>
            {disks.map((d) => (
              <div key={d.path} className="mb-3 last:mb-0">
                <div className="mb-1 flex justify-between text-xs"><span className="font-mono text-slate-300">{d.path}</span>{!d.error && <span className="text-slate-400">{bytes(d.used)} / {bytes(d.total)}</span>}</div>
                {d.error ? <div className="text-xs text-slate-500">Tidak bisa dibaca ({d.error})</div> : (
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className={cx('h-full rounded-full', d.used / d.total > 0.85 ? 'bg-rose-500' : d.used / d.total > 0.7 ? 'bg-amber-400' : 'bg-emerald-500')} style={{ width: `${(d.used / d.total) * 100}%` }} />
                  </div>
                )}
              </div>
            ))}
          </section>

          {info?.ok && (
            <section className="card p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Cpu className="h-4 w-4" /> Host</h2>
              <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
                <dt className="text-slate-500">OS</dt><dd className="text-slate-300">{info.os}</dd>
                <dt className="text-slate-500">Kernel</dt><dd className="truncate text-slate-300">{info.kernel}</dd>
                <dt className="text-slate-500">CPU</dt><dd className="text-slate-300">{info.cpus} core</dd>
                <dt className="text-slate-500">RAM</dt><dd className="text-slate-300">{bytes(info.memTotal)}</dd>
                <dt className="text-slate-500">Docker</dt><dd className="text-slate-300">{info.dockerVersion}</dd>
                <dt className="text-slate-500">Image</dt><dd className="text-slate-300">{info.images}</dd>
              </dl>
            </section>
          )}

          <section className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Activity className="h-4 w-4" /> Aktivitas terbaru</h2>
            {activity.length === 0 ? <p className="text-xs text-slate-500">Belum ada aktivitas.</p> : (
              <ul className="space-y-2">
                {activity.map((a) => (
                  <li key={a.id} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <Badge tone={a.actor === 'ai' ? 'violet' : 'gray'}>{a.actor === 'ai' ? 'AI' : 'User'}</Badge>
                      <span className={a.success ? 'text-slate-300' : 'text-rose-300'}>{a.action}</span>
                      <span className="truncate text-slate-400">{a.target}</span>
                    </div>
                    <div className="mt-0.5 text-slate-600">{timeAgo(a.createdAt)}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
