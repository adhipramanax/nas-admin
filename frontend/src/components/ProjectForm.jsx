import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { CATEGORIES, CATEGORY_LABEL, STATUSES, STATUS_LABEL } from '../lib/format.js';
import { ErrorBox, Field, Modal, Spinner } from './ui.jsx';

const EMPTY = {
  name: '', description: '', category: 'web', status: 'aktif', stack: '', location: '', repoUrl: '', branch: '',
  localUrl: '', publicUrl: '', healthUrl: '', composeProject: '', containers: '', tags: '', notes: '', pinned: false,
};

export default function ProjectForm({ open, onClose, project, initial, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [composeOptions, setComposeOptions] = useState([]);

  useEffect(() => {
    if (!open) return;
    const src = project || initial || {};
    setForm({
      ...EMPTY,
      ...Object.fromEntries(Object.entries(src).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? ''])),
      containers: (src.containers || []).join(', '),
      tags: (src.tags || []).join(', '),
      pinned: !!src.pinned,
    });
    setError(null);
    api('/docker/containers')
      .then((d) => setComposeOptions([...new Set(d.containers.map((c) => c.composeProject).filter(Boolean))].sort()))
      .catch(() => {});
  }, [open, project, initial]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...form };
      if (initial?.docs && !project) body.docs = initial.docs;
      const saved = project
        ? await api(`/projects/${project.id}`, { method: 'PUT', body })
        : await api('/projects', { method: 'POST', body });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? `Edit ${project.name}` : 'Project baru'}
      wide
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} type="button">Batal</button>
          <button className="btn-primary" form="project-form" disabled={busy}>{busy && <Spinner />} Simpan</button>
        </>
      }
    >
      <form id="project-form" onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama project *"><input className="input" value={form.name} onChange={set('name')} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kategori">
              <select className="input" value={form.category} onChange={set('category')}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={form.status} onChange={set('status')}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </Field>
          </div>
        </div>
        <Field label="Deskripsi singkat"><input className="input" value={form.description} onChange={set('description')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Stack / teknologi"><input className="input" placeholder="Next.js + Prisma + PostgreSQL" value={form.stack} onChange={set('stack')} /></Field>
          <Field label="Lokasi di NAS"><input className="input font-mono" placeholder="/mnt/data/app/web/nama" value={form.location} onChange={set('location')} /></Field>
          <Field label="Repository"><input className="input" placeholder="https://github.com/…" value={form.repoUrl} onChange={set('repoUrl')} /></Field>
          <Field label="Branch"><input className="input" placeholder="master" value={form.branch} onChange={set('branch')} /></Field>
          <Field label="URL lokal (LAN)"><input className="input" placeholder="http://192.168.110.10:8010" value={form.localUrl} onChange={set('localUrl')} /></Field>
          <Field label="URL publik"><input className="input" placeholder="https://domain.com" value={form.publicUrl} onChange={set('publicUrl')} /></Field>
        </div>

        <div className="rounded-lg border border-slate-800 p-3">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Monitoring otomatis</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Docker compose project" hint="Semua container dengan label compose ini otomatis tertaut.">
              <input className="input font-mono" list="compose-options" value={form.composeProject} onChange={set('composeProject')} />
              <datalist id="compose-options">{composeOptions.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Container tambahan" hint="Pisahkan dengan koma. Untuk container di luar compose.">
              <input className="input font-mono" value={form.containers} onChange={set('containers')} />
            </Field>
            <Field label="Health check URL" hint="Dicek dari dalam container, mis. http://host.docker.internal:8010">
              <input className="input font-mono" value={form.healthUrl} onChange={set('healthUrl')} />
            </Field>
            <Field label="Tag" hint="Pisahkan dengan koma"><input className="input" value={form.tags} onChange={set('tags')} /></Field>
          </div>
        </div>

        <Field label="Catatan singkat"><textarea className="input" rows={2} value={form.notes} onChange={set('notes')} /></Field>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.pinned} onChange={set('pinned')} className="accent-emerald-500" /> Sematkan di atas
        </label>
      </form>
    </Modal>
  );
}
