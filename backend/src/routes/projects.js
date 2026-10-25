import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { getProject, getProjects, publicCredential, uniqueSlug } from '../lib/inventory.js';
import { checkProject } from '../lib/health.js';
import { locationExists } from '../lib/system.js';
import { logActivity } from '../lib/activity.js';

const r = Router();

export const PROJECT_FIELDS = [
  'name', 'description', 'category', 'status', 'stack', 'location', 'repoUrl', 'branch',
  'localUrl', 'publicUrl', 'healthUrl', 'composeProject', 'containers', 'tags', 'docs', 'notes', 'pinned',
];
export const CATEGORIES = ['web', 'app', 'infra', 'database', 'tool', 'lainnya'];
export const STATUSES = ['aktif', 'development', 'maintenance', 'nonaktif', 'arsip'];

/** Bersihkan input project: hanya field yang dikenal, string kosong -> null */
export function cleanProject(body, partial = false) {
  const data = {};
  for (const f of PROJECT_FIELDS) {
    if (!(f in body)) continue;
    let v = body[f];
    if (f === 'containers' || f === 'tags') {
      if (typeof v === 'string') v = v.split(',');
      v = Array.isArray(v) ? [...new Set(v.map((s) => String(s).trim()).filter(Boolean))] : [];
    } else if (f === 'pinned') {
      v = !!v;
    } else {
      v = v === null || v === undefined ? null : String(v).trim();
      if (v === '') v = null;
    }
    data[f] = v;
  }
  if (!partial && !data.name) throw Object.assign(new Error('Nama project wajib diisi'), { status: 400 });
  if ('name' in data && !data.name) throw Object.assign(new Error('Nama project tidak boleh kosong'), { status: 400 });
  if (data.category && !CATEGORIES.includes(data.category)) data.category = 'lainnya';
  if (data.status && !STATUSES.includes(data.status)) {
    throw Object.assign(new Error(`Status harus salah satu dari: ${STATUSES.join(', ')}`), { status: 400 });
  }
  return data;
}

r.get('/', async (req, res) => {
  res.json(await getProjects());
});

r.get('/:idOrSlug', async (req, res) => {
  const p = await getProject(req.params.idOrSlug);
  if (!p) return res.status(404).json({ error: 'Project tidak ditemukan' });
  p.locationExists = await locationExists(p.location);
  res.json(p);
});

r.post('/', async (req, res) => {
  const data = cleanProject(req.body || {});
  data.slug = await uniqueSlug(data.name);
  const p = await prisma.project.create({ data });
  await logActivity({ action: 'project.create', target: p.name });
  res.status(201).json(p);
});

r.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const data = cleanProject(req.body || {}, true);
  if (data.name) data.slug = await uniqueSlug(data.name, id);
  const p = await prisma.project.update({ where: { id }, data });
  await logActivity({ action: 'project.update', target: p.name });
  res.json(p);
});

r.delete('/:id', async (req, res) => {
  const p = await prisma.project.delete({ where: { id: Number(req.params.id) } });
  await logActivity({ action: 'project.delete', target: p.name });
  res.json({ ok: true });
});

r.post('/:id/check', async (req, res) => {
  const p = await prisma.project.findUnique({ where: { id: Number(req.params.id) } });
  if (!p) return res.status(404).json({ error: 'Project tidak ditemukan' });
  res.json((await checkProject(p)) || { ok: null, error: 'Health URL belum diisi' });
});

// ===== Kredensial / akses admin =====
function cleanCredential(b) {
  const s = (v) => (v === undefined ? undefined : v === null || String(v).trim() === '' ? null : String(v).trim());
  const data = { label: s(b.label), url: s(b.url), username: s(b.username), notes: s(b.notes) };
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
  return data;
}

r.post('/:id/credentials', async (req, res) => {
  const data = cleanCredential(req.body || {});
  if (!data.label) return res.status(400).json({ error: 'Label wajib diisi' });
  const c = await prisma.credential.create({
    data: { ...data, projectId: Number(req.params.id), secretEnc: encrypt(req.body.secret) },
  });
  await logActivity({ action: 'credential.create', target: c.label });
  res.status(201).json(publicCredential(c));
});

export const credentialRouter = Router();

credentialRouter.put('/:id', async (req, res) => {
  const data = cleanCredential(req.body || {});
  // secret hanya diubah jika field dikirim; string kosong = hapus password
  if ('secret' in (req.body || {})) data.secretEnc = encrypt(req.body.secret);
  const c = await prisma.credential.update({ where: { id: Number(req.params.id) }, data });
  await logActivity({ action: 'credential.update', target: c.label });
  res.json(publicCredential(c));
});

credentialRouter.delete('/:id', async (req, res) => {
  const c = await prisma.credential.delete({ where: { id: Number(req.params.id) } });
  await logActivity({ action: 'credential.delete', target: c.label });
  res.json({ ok: true });
});

credentialRouter.get('/:id/secret', async (req, res) => {
  const c = await prisma.credential.findUnique({ where: { id: Number(req.params.id) } });
  if (!c) return res.status(404).json({ error: 'Kredensial tidak ditemukan' });
  try {
    res.json({ secret: decrypt(c.secretEnc) });
  } catch {
    res.status(500).json({ error: 'Gagal dekripsi — apakah ENCRYPTION_KEY berubah?' });
  }
});

export default r;
