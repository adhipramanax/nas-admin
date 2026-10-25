import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import {
  CONTAINER_ACTIONS,
  containerAction,
  containerLogs,
  containerStats,
  dockerInfo,
  listContainers,
} from '../lib/docker.js';
import { matchContainers } from '../lib/inventory.js';
import { logActivity } from '../lib/activity.js';

const r = Router();

r.get('/containers', async (req, res) => {
  const [docker, projects] = await Promise.all([listContainers(), prisma.project.findMany()]);
  const owner = new Map();
  for (const p of projects) {
    for (const c of matchContainers(p, docker.containers)) owner.set(c.name, { id: p.id, name: p.name, slug: p.slug });
  }
  res.json({
    ok: docker.ok,
    error: docker.error,
    containers: docker.containers.map((c) => ({ ...c, project: owner.get(c.name) || null })),
  });
});

r.get('/info', async (req, res) => {
  res.json(await dockerInfo());
});

r.get('/containers/:name/logs', async (req, res) => {
  const tail = Math.min(Number(req.query.tail || 200), 2000);
  res.json({ logs: await containerLogs(req.params.name, tail) });
});

r.get('/containers/:name/stats', async (req, res) => {
  res.json(await containerStats(req.params.name));
});

// Aksi langsung dari UI (user sudah klik konfirmasi di dialog)
r.post('/containers/:name/:action', async (req, res) => {
  const { name, action } = req.params;
  if (!CONTAINER_ACTIONS.includes(action)) return res.status(400).json({ error: 'Aksi tidak valid' });
  try {
    const c = await containerAction(name, action);
    await logActivity({ action: `container.${action}`, target: c.name });
    res.json({ ok: true, container: c.name });
  } catch (e) {
    await logActivity({ action: `container.${action}`, target: name, detail: e.message, success: false });
    res.status(e.statusCode === 304 ? 409 : 400).json({ error: e.statusCode === 304 ? 'Container sudah dalam kondisi tersebut' : e.message });
  }
});

/**
 * Container/compose project yang belum didokumentasikan -> saran project baru.
 */
r.get('/discover', async (req, res) => {
  const [docker, projects] = await Promise.all([listContainers(), prisma.project.findMany()]);
  const linked = new Set();
  for (const p of projects) for (const c of matchContainers(p, docker.containers)) linked.add(c.name);

  const groups = new Map();
  for (const c of docker.containers) {
    if (linked.has(c.name) || c.protected) continue;
    const key = c.composeProject || c.name;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        composeProject: c.composeProject,
        workingDir: c.workingDir,
        containers: [],
        ports: new Set(),
      });
    }
    const g = groups.get(key);
    g.containers.push({ name: c.name, image: c.image, state: c.state });
    c.ports.filter((p) => p.public).forEach((p) => g.ports.add(p.public));
  }
  res.json({
    ok: docker.ok,
    suggestions: [...groups.values()].map((g) => ({ ...g, ports: [...g.ports].sort((a, b) => a - b) })),
  });
});

export default r;
