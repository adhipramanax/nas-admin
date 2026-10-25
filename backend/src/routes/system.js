import { Router } from '../lib/router.js';
import { prisma } from '../lib/prisma.js';
import { dockerInfo, dockerStatus, listContainers } from '../lib/docker.js';
import { getPortTable, getProjects } from '../lib/inventory.js';
import { diskUsage } from '../lib/system.js';
import { getSettings, setSetting } from '../lib/settings.js';
import { config } from '../config.js';

const r = Router();

r.get('/overview', async (req, res) => {
  const [{ projects }, docker, info, disks, ports, activity, discover] = await Promise.all([
    getProjects(),
    listContainers(),
    dockerInfo(),
    diskUsage(),
    getPortTable(),
    prisma.activityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
    undocumentedCount(),
  ]);
  const byStatus = {};
  for (const p of projects) byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  const withHealth = projects.filter((p) => p.live.health);
  res.json({
    nasLanIp: config.nasLanIp,
    docker: { ok: docker.ok, error: docker.error, info },
    counts: {
      projects: projects.length,
      byStatus,
      containers: docker.containers.length,
      running: docker.containers.filter((c) => c.state === 'running').length,
      ports: ports.ports.length,
      portConflicts: ports.ports.filter((p) => p.conflict).length,
      healthUp: withHealth.filter((p) => p.live.health.ok).length,
      healthDown: withHealth.filter((p) => !p.live.health.ok).length,
      undocumented: discover,
    },
    disks,
    projects: projects.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      status: p.status,
      category: p.category,
      localUrl: p.localUrl,
      publicUrl: p.publicUrl,
      live: { state: p.live.state, running: p.live.running, total: p.live.total, health: p.live.health },
    })),
    activity,
  });
});

async function undocumentedCount() {
  const [docker, projects] = await Promise.all([listContainers(), prisma.project.findMany()]);
  const linked = new Set();
  for (const p of projects) {
    for (const c of docker.containers) {
      if ((p.composeProject && c.composeProject === p.composeProject) || p.containers.includes(c.name)) linked.add(c.name);
    }
  }
  return docker.containers.filter((c) => !linked.has(c.name) && !c.protected).length;
}

r.get('/activity', async (req, res) => {
  const take = Math.min(Number(req.query.take || 100), 500);
  res.json(await prisma.activityLog.findMany({ orderBy: { createdAt: 'desc' }, take }));
});

r.get('/settings', async (req, res) => {
  res.json({
    ...(await getSettings()),
    dockerHost: dockerStatus().host,
    hostCheckAddr: config.hostCheckAddr,
    hostMounts: config.hostMounts,
    healthInterval: config.healthInterval,
  });
});

r.put('/settings', async (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) await setSetting(k, v);
  res.json(await getSettings());
});

// ===== Export dokumentasi (tanpa password) =====
r.get('/export/markdown', async (req, res) => {
  const projects = await prisma.project.findMany({
    include: { ports: true, credentials: true },
    orderBy: { name: 'asc' },
  });
  const manualPorts = await prisma.port.findMany({ where: { projectId: null }, orderBy: { port: 'asc' } });
  const lines = [`# Dokumentasi NAS`, ``, `Diekspor: ${new Date().toISOString()}`, ``];
  lines.push(`## Daftar project`, ``, `| Project | Status | Port | Lokal | Publik |`, `|---|---|---|---|---|`);
  for (const p of projects) {
    lines.push(`| ${p.name} | ${p.status} | ${p.ports.map((x) => x.port).join(', ')} | ${p.localUrl || ''} | ${p.publicUrl || ''} |`);
  }
  if (manualPorts.length) {
    lines.push(``, `## Port sistem`, ``);
    for (const m of manualPorts) lines.push(`- **${m.port}/${m.protocol}** — ${m.service}${m.description ? `: ${m.description}` : ''}`);
  }
  for (const p of projects) {
    lines.push(``, `---`, ``, `## ${p.name}`, ``);
    if (p.description) lines.push(p.description, ``);
    const info = [
      ['Kategori', p.category], ['Status', p.status], ['Stack', p.stack], ['Lokasi', p.location && `\`${p.location}\``],
      ['Repo', p.repoUrl], ['Branch', p.branch], ['URL lokal', p.localUrl], ['URL publik', p.publicUrl],
      ['Compose project', p.composeProject], ['Container', p.containers.join(', ')],
    ].filter(([, v]) => v);
    for (const [k, v] of info) lines.push(`- **${k}:** ${v}`);
    if (p.credentials.length) {
      lines.push(``, `**Akses admin** (password tersimpan terenkripsi di dashboard):`);
      for (const c of p.credentials) lines.push(`- ${c.label}${c.url ? ` — ${c.url}` : ''}${c.username ? ` — user: \`${c.username}\`` : ''}`);
    }
    if (p.docs) lines.push(``, p.docs);
    if (p.notes) lines.push(``, `> ${p.notes.replace(/\n/g, '\n> ')}`);
  }
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="nas-docs-${new Date().toISOString().slice(0, 10)}.md"`);
  res.send(lines.join('\n'));
});

r.get('/export/json', async (req, res) => {
  const projects = await prisma.project.findMany({ include: { ports: true, credentials: true } });
  const ports = await prisma.port.findMany({ where: { projectId: null } });
  // Password tetap dalam bentuk terenkripsi — hanya bisa dibuka dengan ENCRYPTION_KEY yang sama
  res.setHeader('Content-Disposition', `attachment; filename="nas-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ version: 1, exportedAt: new Date().toISOString(), projects, ports });
});

export default r;
