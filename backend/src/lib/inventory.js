// Logika gabungan: data project (database) + kondisi live (Docker, health check)
// Dipakai oleh REST API dan AI agent.
import { prisma } from './prisma.js';
import { listContainers } from './docker.js';
import { healthCache, tcpCheck } from './health.js';

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'project';
}

export async function uniqueSlug(name, excludeId = null) {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; ; i++) {
    const found = await prisma.project.findUnique({ where: { slug } });
    if (!found || found.id === excludeId) return slug;
    slug = `${base}-${i}`;
  }
}

export function matchContainers(project, containers) {
  const names = new Set(project.containers || []);
  return containers.filter(
    (c) => (project.composeProject && c.composeProject === project.composeProject) || names.has(c.name)
  );
}

export function publicCredential(c) {
  return {
    id: c.id,
    projectId: c.projectId,
    label: c.label,
    url: c.url,
    username: c.username,
    notes: c.notes,
    hasSecret: !!c.secretEnc,
    updatedAt: c.updatedAt,
  };
}

function liveSummary(project, containers) {
  const matched = matchContainers(project, containers);
  const running = matched.filter((c) => c.state === 'running').length;
  let state = 'unknown';
  if (matched.length) state = running === matched.length ? 'running' : running === 0 ? 'stopped' : 'partial';
  return {
    state,
    running,
    total: matched.length,
    containers: matched.map((c) => ({
      name: c.name,
      state: c.state,
      status: c.status,
      health: c.health,
      ports: c.ports,
      protected: c.protected,
    })),
    publishedPorts: [...new Set(matched.flatMap((c) => c.ports.filter((p) => p.public).map((p) => p.public)))].sort(
      (a, b) => a - b
    ),
    health: healthCache.get(project.slug) || null,
  };
}

export function serializeProject(p, containers) {
  const { credentials, ...rest } = p;
  return {
    ...rest,
    credentials: credentials ? credentials.map(publicCredential) : undefined,
    credentialCount: credentials ? credentials.length : undefined,
    live: liveSummary(p, containers),
  };
}

export async function getProjects() {
  const [projects, docker] = await Promise.all([
    prisma.project.findMany({
      include: { ports: true, credentials: true },
      orderBy: [{ pinned: 'desc' }, { name: 'asc' }],
    }),
    listContainers(),
  ]);
  return {
    docker: { ok: docker.ok, error: docker.error },
    projects: projects.map((p) => {
      const s = serializeProject(p, docker.containers);
      delete s.credentials; // daftar hanya butuh jumlah
      return s;
    }),
  };
}

export async function getProject(idOrSlug) {
  const where = /^\d+$/.test(String(idOrSlug)) ? { id: Number(idOrSlug) } : { slug: String(idOrSlug) };
  const p = await prisma.project.findUnique({
    where,
    include: { ports: true, credentials: { orderBy: { label: 'asc' } } },
  });
  if (!p) return null;
  const docker = await listContainers();
  return serializeProject(p, docker.containers);
}

/**
 * Tabel port gabungan: port dari Docker (otomatis) + port manual.
 * Satu baris per port/protokol, menandai konflik bila dipakai >1 pemilik.
 */
export async function getPortTable() {
  const [docker, projects, manual] = await Promise.all([
    listContainers(),
    prisma.project.findMany(),
    prisma.port.findMany({ include: { project: true } }),
  ]);

  const projectOfContainer = new Map();
  for (const p of projects) {
    for (const c of matchContainers(p, docker.containers)) projectOfContainer.set(c.name, p);
  }

  const rows = new Map();
  const row = (port, protocol) => {
    const key = `${port}/${protocol}`;
    if (!rows.has(key)) rows.set(key, { port, protocol, docker: [], manual: [], owners: new Set() });
    return rows.get(key);
  };

  for (const c of docker.containers) {
    for (const p of c.ports) {
      if (!p.public) continue;
      const proj = projectOfContainer.get(c.name);
      const r = row(p.public, p.type);
      r.docker.push({
        container: c.name,
        state: c.state,
        privatePort: p.private,
        ip: p.ip,
        composeProject: c.composeProject,
        project: proj ? { id: proj.id, name: proj.name, slug: proj.slug } : null,
      });
      r.owners.add(proj ? `p:${proj.id}` : `c:${c.composeProject || c.name}`);
    }
  }
  for (const m of manual) {
    const r = row(m.port, m.protocol);
    r.manual.push({
      id: m.id,
      service: m.service,
      description: m.description,
      project: m.project ? { id: m.project.id, name: m.project.name, slug: m.project.slug } : null,
    });
    r.owners.add(m.project ? `p:${m.project.id}` : `m:${m.service}`);
  }

  const list = [...rows.values()]
    .map(({ owners, ...r }) => ({
      ...r,
      conflict: owners.size > 1,
      active: r.docker.some((d) => d.state === 'running'),
      source: r.docker.length && r.manual.length ? 'both' : r.docker.length ? 'docker' : 'manual',
    }))
    .sort((a, b) => a.port - b.port || a.protocol.localeCompare(b.protocol));

  return { docker: { ok: docker.ok, error: docker.error }, ports: list };
}

/** Cari port kosong mulai dari `from`: tidak tercatat & tidak sedang listen di host */
export async function findFreePort(from = 8000, to = 9000, count = 1) {
  const { ports } = await getPortTable();
  const used = new Set(ports.map((p) => p.port));
  const found = [];
  for (let port = from; port <= to && found.length < count; port++) {
    if (used.has(port)) continue;
    const r = await tcpCheck(port);
    if (!r.open) found.push(port);
  }
  return found;
}
