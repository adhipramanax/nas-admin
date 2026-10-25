import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { findFreePort, getPortTable } from '../lib/inventory.js';
import { tcpCheck } from '../lib/health.js';
import { logActivity } from '../lib/activity.js';

const r = Router();

r.get('/', async (req, res) => {
  res.json(await getPortTable());
});

// Cek port mana yang sedang listen di host NAS
r.post('/check', async (req, res) => {
  const ports = (req.body?.ports || []).map(Number).filter((p) => p > 0 && p < 65536).slice(0, 200);
  const results = await Promise.all(ports.map((p) => tcpCheck(p)));
  res.json({ results });
});

r.get('/free', async (req, res) => {
  const from = Number(req.query.from || 8000);
  const to = Number(req.query.to || from + 1000);
  const count = Math.min(Number(req.query.count || 5), 20);
  res.json({ ports: await findFreePort(from, to, count) });
});

function cleanPort(b) {
  const port = Number(b.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw Object.assign(new Error('Nomor port harus 1-65535'), { status: 400 });
  }
  if (!b.service || !String(b.service).trim()) {
    throw Object.assign(new Error('Nama layanan wajib diisi'), { status: 400 });
  }
  return {
    port,
    protocol: b.protocol === 'udp' ? 'udp' : 'tcp',
    service: String(b.service).trim(),
    description: b.description ? String(b.description).trim() : null,
    projectId: b.projectId ? Number(b.projectId) : null,
  };
}

r.post('/', async (req, res) => {
  const p = await prisma.port.create({ data: cleanPort(req.body || {}) });
  await logActivity({ action: 'port.create', target: `${p.port}/${p.protocol} ${p.service}` });
  res.status(201).json(p);
});

r.put('/:id', async (req, res) => {
  const p = await prisma.port.update({ where: { id: Number(req.params.id) }, data: cleanPort(req.body || {}) });
  res.json(p);
});

r.delete('/:id', async (req, res) => {
  const p = await prisma.port.delete({ where: { id: Number(req.params.id) } });
  await logActivity({ action: 'port.delete', target: `${p.port}/${p.protocol} ${p.service}` });
  res.json({ ok: true });
});

export default r;
