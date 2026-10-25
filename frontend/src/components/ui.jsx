import { useEffect, useState } from 'react';
import { Check, Copy, Loader2, X } from 'lucide-react';
import { STATUS_LABEL } from '../lib/format.js';

export function cx(...a) {
  return a.filter(Boolean).join(' ');
}

const TONES = {
  green: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  red: 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
  amber: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  blue: 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
  violet: 'bg-violet-500/10 text-violet-300 ring-violet-500/30',
  gray: 'bg-slate-500/10 text-slate-300 ring-slate-500/30',
};

export function Badge({ tone = 'gray', children, className }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>
      {children}
    </span>
  );
}

const STATUS_TONE = { aktif: 'green', development: 'blue', maintenance: 'amber', nonaktif: 'gray', arsip: 'gray' };
export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] || 'gray'}>{STATUS_LABEL[status] || status}</Badge>;
}

const DOT = {
  running: 'bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60',
  partial: 'bg-amber-400',
  stopped: 'bg-rose-500',
  exited: 'bg-rose-500',
  dead: 'bg-rose-500',
  restarting: 'bg-amber-400 animate-pulse',
  paused: 'bg-sky-400',
  created: 'bg-slate-400',
  unknown: 'bg-slate-600',
};
export function Dot({ state, className }) {
  return <span className={cx('inline-block h-2 w-2 shrink-0 rounded-full', DOT[state] || DOT.unknown, className)} />;
}

export function LiveBadge({ live }) {
  if (!live || live.state === 'unknown') return <Badge tone="gray"><Dot state="unknown" />Tidak tertaut</Badge>;
  const tone = { running: 'green', partial: 'amber', stopped: 'red' }[live.state];
  const label = { running: 'Running', partial: 'Sebagian', stopped: 'Mati' }[live.state];
  return (
    <Badge tone={tone}>
      <Dot state={live.state} />
      {label} {live.running}/{live.total}
    </Badge>
  );
}

export function HealthBadge({ health }) {
  if (!health) return null;
  return health.ok ? (
    <Badge tone="green">HTTP {health.status} · {health.ms}ms</Badge>
  ) : (
    <Badge tone="red">Down · {health.error || health.status}</Badge>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={cx('h-4 w-4 animate-spin', className)} />;
}

export function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
      <Spinner /> Memuat…
    </div>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error.message || String(error)}</div>;
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-slate-400">
      {Icon && <Icon className="h-8 w-8 text-slate-600" />}
      <div className="font-medium text-slate-300">{title}</div>
      {children && <div className="max-w-md text-sm">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={cx('card w-full bg-slate-900 shadow-2xl', wide ? 'max-w-4xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="font-semibold text-white">{title}</h2>
          <button className="btn-ghost p-1" onClick={onClose} aria-label="Tutup"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-800 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function CopyButton({ text, className, label }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback untuk http (non-secure context)
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1200);
  };
  return (
    <button type="button" onClick={copy} className={cx('btn-ghost p-1 text-slate-400', className)} title="Salin">
      {done ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

export function Stat({ icon: Icon, label, value, sub, tone = 'text-white' }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
        {Icon && <Icon className="h-4 w-4" />} {label}
      </div>
      <div className={cx('mt-2 text-2xl font-semibold tabular-nums', tone)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

let toastListener = null;
export function toast(msg, tone = 'green') {
  toastListener?.({ msg, tone, id: Math.random() });
}
export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    toastListener = (t) => {
      setItems((x) => [...x, t]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 3500);
    };
    return () => (toastListener = null);
  }, []);
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} className={cx('rounded-lg px-4 py-2 text-sm shadow-lg ring-1', t.tone === 'red' ? 'bg-rose-950 text-rose-200 ring-rose-500/40' : 'bg-slate-800 text-slate-100 ring-emerald-500/40')}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
