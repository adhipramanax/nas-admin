import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bot, Check, Send, Trash2, Wrench, X } from 'lucide-react';
import { api } from '../lib/api.js';
import Markdown from './Markdown.jsx';
import { Badge, cx, Spinner } from './ui.jsx';

const SUGGESTIONS = [
  'Bagaimana kondisi NAS saat ini?',
  'Container mana yang mati?',
  'Cari 3 port kosong mulai dari 8000',
  'Cek log container basinang, ada error?',
  'Project mana yang dokumentasinya masih kosong?',
];

const TOOL_LABEL = {
  get_overview: 'Lihat ringkasan',
  list_projects: 'Daftar project',
  get_project: 'Baca project',
  list_containers: 'Daftar container',
  get_container_logs: 'Baca log',
  get_container_stats: 'Statistik container',
  list_ports: 'Daftar port',
  find_free_port: 'Cari port kosong',
  check_project_health: 'Cek web',
  update_project: 'Ubah project',
  append_project_docs: 'Tambah dokumentasi',
  create_project: 'Buat project',
  add_port: 'Catat port',
  request_container_action: 'Minta aksi container',
};

function PendingAction({ action, onResolved }) {
  const [state, setState] = useState('pending'); // pending | busy | done | cancelled
  const [result, setResult] = useState(null);

  const confirm = async () => {
    setState('busy');
    try {
      const r = await api(`/agent/actions/${action.id}/confirm`, { method: 'POST' });
      setResult(r);
      setState('done');
      onResolved(`[Sistem] Pengguna mengkonfirmasi ${action.action} ${action.container}. Hasil: ${r.message}`);
    } catch (e) {
      setResult({ ok: false, message: e.message });
      setState('done');
    }
  };
  const cancel = async () => {
    await api(`/agent/actions/${action.id}/cancel`, { method: 'POST' }).catch(() => {});
    setState('cancelled');
    onResolved(`[Sistem] Pengguna membatalkan ${action.action} ${action.container}.`);
  };

  return (
    <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-amber-200">
        <AlertTriangle className="h-4 w-4" /> Konfirmasi: {action.action} <code className="rounded bg-black/30 px-1">{action.container}</code>
      </div>
      {action.reason && <div className="mt-1 text-xs text-amber-100/80">Alasan: {action.reason}</div>}
      {state === 'pending' && (
        <div className="mt-2 flex gap-2">
          <button className={action.action === 'stop' ? 'btn-danger' : 'btn-primary'} onClick={confirm}><Check className="h-4 w-4" />Konfirmasi</button>
          <button className="btn-ghost" onClick={cancel}>Batal</button>
        </div>
      )}
      {state === 'busy' && <div className="mt-2 flex items-center gap-2 text-amber-100"><Spinner /> Menjalankan…</div>}
      {state === 'done' && <div className={cx('mt-2 text-xs', result?.ok ? 'text-emerald-300' : 'text-rose-300')}>{result?.message}</div>}
      {state === 'cancelled' && <div className="mt-2 text-xs text-slate-400">Dibatalkan.</div>}
    </div>
  );
}

export default function AgentPanel({ open, onClose, messages, setMessages, onDataChanged }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (open) api('/agent/status').then(setStatus).catch(() => setStatus({ ok: false }));
  }, [open]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput('');
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setBusy(true);
    try {
      const r = await api('/agent/chat', { method: 'POST', body: { messages: next.map(({ role, content }) => ({ role, content })) } });
      setMessages((m) => [...m, { role: 'assistant', content: r.reply, trace: r.trace, pendingActions: r.pendingActions }]);
      if (r.trace?.some((t) => ['update_project', 'append_project_docs', 'create_project', 'add_port'].includes(t.tool) && t.ok)) onDataChanged?.();
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${e.message}`, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  // Catat hasil konfirmasi sebagai konteks untuk giliran berikutnya
  const addSystemNote = (note) => {
    setMessages((m) => [...m, { role: 'user', content: note, hidden: true }]);
    onDataChanged?.();
  };

  return (
    <aside className={cx('fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-slate-800 bg-slate-950 shadow-2xl transition-transform duration-200', open ? 'translate-x-0' : 'translate-x-full')}>
      <header className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
        <Bot className="h-5 w-5 text-emerald-400" />
        <div className="flex-1">
          <div className="font-semibold text-white">NAS Assistant</div>
          <div className="text-xs text-slate-500">
            {status === null ? 'Memeriksa Ollama…' : status.ok ? (
              <>Ollama · {status.model}{!status.modelInstalled && <span className="text-amber-400"> (model belum di-pull)</span>}</>
            ) : (
              <span className="text-rose-400">Ollama tidak terhubung</span>
            )}
          </div>
        </div>
        {messages.length > 0 && (
          <button className="btn-ghost p-1.5" title="Hapus percakapan" onClick={() => setMessages([])}><Trash2 className="h-4 w-4" /></button>
        )}
        <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Tutup"><X className="h-4 w-4" /></button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              Tanya apa saja tentang NAS Anda. Saya bisa membaca status container, port, log, dan dokumentasi; merapikan dokumentasi; serta meminta start/stop/restart container (dengan konfirmasi Anda).
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-emerald-500 hover:text-white" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.filter((m) => !m.hidden).map((m, i) => (
          <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[90%] rounded-xl px-3 py-2 text-sm', m.role === 'user' ? 'bg-emerald-600/90 text-white' : m.error ? 'bg-rose-500/10 text-rose-200 ring-1 ring-rose-500/30' : 'bg-slate-900 ring-1 ring-slate-800')}>
              {m.trace?.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {m.trace.map((t, j) => (
                    <Badge key={j} tone={t.ok ? 'gray' : 'red'}><Wrench className="h-3 w-3" />{TOOL_LABEL[t.tool] || t.tool}{t.args?.container || t.args?.slug ? `: ${t.args.container || t.args.slug}` : ''}</Badge>
                  ))}
                </div>
              )}
              {m.role === 'assistant' ? <Markdown>{m.content}</Markdown> : <div className="whitespace-pre-wrap">{m.content}</div>}
              {m.pendingActions?.map((a) => <PendingAction key={a.id} action={a} onResolved={addSystemNote} />)}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-slate-400"><Spinner /> AI sedang bekerja… (model lokal bisa butuh waktu)</div>
        )}
        <div ref={endRef} />
      </div>

      <form className="border-t border-slate-800 p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="flex items-end gap-2">
          <textarea
            className="input min-h-[42px] resize-none"
            rows={1}
            placeholder="Tulis pertanyaan atau perintah…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="btn-primary h-[42px] px-3" disabled={busy || !input.trim()} aria-label="Kirim"><Send className="h-4 w-4" /></button>
        </div>
      </form>
    </aside>
  );
}
