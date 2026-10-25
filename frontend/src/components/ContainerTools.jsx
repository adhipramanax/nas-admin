import { useEffect, useRef, useState } from 'react';
import { Play, RefreshCw, RotateCw, ScrollText, Square } from 'lucide-react';
import { api } from '../lib/api.js';
import { Modal, Spinner, toast } from './ui.jsx';

export function LogsModal({ container, onClose }) {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [tail, setTail] = useState(200);
  const [filter, setFilter] = useState('');
  const ref = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api(`/docker/containers/${encodeURIComponent(container)}/logs?tail=${tail}`);
      setLogs(d.logs);
      setTimeout(() => ref.current && (ref.current.scrollTop = ref.current.scrollHeight), 0);
    } catch (e) {
      setLogs(`Gagal mengambil log: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (container) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, tail]);

  const lines = logs.split('\n').filter((l) => !filter || l.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Modal open={!!container} onClose={onClose} title={`Log: ${container}`} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Filter (mis. error)" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <select className="input w-auto" value={tail} onChange={(e) => setTail(Number(e.target.value))}>
          {[100, 200, 500, 1000, 2000].map((n) => <option key={n} value={n}>{n} baris</option>)}
        </select>
        <button className="btn-outline" onClick={load} disabled={loading}>{loading ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Muat ulang</button>
      </div>
      <pre ref={ref} className="h-[55vh] overflow-auto rounded-lg bg-black/60 p-3 font-mono text-[11px] leading-relaxed text-slate-300 ring-1 ring-slate-800">
        {lines.map((l, i) => (
          <div key={i} className={/error|fatal|exception|fail/i.test(l) ? 'text-rose-300' : /warn/i.test(l) ? 'text-amber-200' : ''}>{l}</div>
        ))}
      </pre>
    </Modal>
  );
}

const ACTION_META = {
  start: { label: 'Start', icon: Play, cls: 'btn-primary' },
  stop: { label: 'Stop', icon: Square, cls: 'btn-danger' },
  restart: { label: 'Restart', icon: RotateCw, cls: 'btn-outline' },
};

/** Tombol aksi container + dialog konfirmasi */
export function ContainerActions({ container, onDone, compact }) {
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await api(`/docker/containers/${encodeURIComponent(container.name)}/${confirm}`, { method: 'POST' });
      toast(`${container.name}: ${confirm} berhasil`);
      onDone?.();
    } catch (e) {
      toast(e.message, 'red');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const running = container.state === 'running';
  const actions = container.protected ? [] : running ? ['restart', 'stop'] : ['start'];

  return (
    <div className="flex items-center gap-1">
      <button className="btn-ghost p-1.5" title="Lihat log" onClick={() => setLogs(true)}><ScrollText className="h-4 w-4" /></button>
      {actions.map((a) => {
        const M = ACTION_META[a];
        return (
          <button key={a} className="btn-ghost p-1.5" title={M.label} onClick={() => setConfirm(a)}>
            <M.icon className="h-4 w-4" />
            {!compact && <span className="sr-only">{M.label}</span>}
          </button>
        );
      })}
      {logs && <LogsModal container={container.name} onClose={() => setLogs(false)} />}
      <Modal
        open={!!confirm}
        onClose={() => !busy && setConfirm(null)}
        title={`Konfirmasi ${confirm}`}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setConfirm(null)} disabled={busy}>Batal</button>
            {confirm && (
              <button className={ACTION_META[confirm].cls} onClick={run} disabled={busy}>
                {busy && <Spinner />} Ya, {confirm}
              </button>
            )}
          </>
        }
      >
        <p className="text-sm text-slate-300">
          Yakin ingin <b>{confirm}</b> container <code className="rounded bg-slate-800 px-1">{container.name}</code>?
          {confirm === 'stop' && ' Layanan ini tidak bisa diakses sampai di-start lagi.'}
        </p>
      </Modal>
    </div>
  );
}
