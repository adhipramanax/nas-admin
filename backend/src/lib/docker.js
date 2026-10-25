import Docker from 'dockerode';
import { config } from '../config.js';

function makeClient() {
  const h = config.dockerHost;
  if (h.startsWith('unix://')) return new Docker({ socketPath: h.replace('unix://', '') });
  const u = new URL(h.replace(/^tcp:/, 'http:'));
  return new Docker({ host: u.hostname, port: Number(u.port || 2375), protocol: 'http' });
}

export const docker = makeClient();

// Container yang tidak boleh di-stop/restart dari dashboard (termasuk dashboard ini sendiri)
const protectedNames = new Set(
  (process.env.PROTECTED_CONTAINERS || 'nas-admin-app,nas-admin-db,nas-admin-socket-proxy')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);
const selfProject = process.env.SELF_COMPOSE_PROJECT || 'nas-admin';

let lastOk = null;
let lastError = null;

function normalize(c) {
  const labels = c.Labels || {};
  const seen = new Set();
  const ports = [];
  for (const p of c.Ports || []) {
    const key = `${p.PublicPort || ''}/${p.PrivatePort}/${p.Type}`;
    if (seen.has(key)) continue; // hilangkan duplikat IPv4/IPv6
    seen.add(key);
    ports.push({
      private: p.PrivatePort,
      public: p.PublicPort || null,
      type: p.Type,
      ip: p.IP || null,
    });
  }
  ports.sort((a, b) => (a.public || 99999) - (b.public || 99999));
  const name = (c.Names?.[0] || '').replace(/^\//, '');
  const composeProject = labels['com.docker.compose.project'] || null;
  return {
    id: c.Id,
    shortId: c.Id.slice(0, 12),
    name,
    image: c.Image,
    state: c.State, // running | exited | restarting | paused | created | dead
    status: c.Status, // "Up 3 days (healthy)"
    health: /\((healthy|unhealthy|health: starting)\)/.exec(c.Status || '')?.[1] || null,
    created: c.Created * 1000,
    ports,
    composeProject,
    composeService: labels['com.docker.compose.service'] || null,
    workingDir: labels['com.docker.compose.project.working_dir'] || null,
    networks: Object.keys(c.NetworkSettings?.Networks || {}),
    protected: protectedNames.has(name) || composeProject === selfProject,
  };
}

/** Daftar semua container (termasuk yang mati). Tidak pernah throw. */
export async function listContainers() {
  try {
    const list = await docker.listContainers({ all: true });
    lastOk = Date.now();
    lastError = null;
    return { ok: true, containers: list.map(normalize).sort((a, b) => a.name.localeCompare(b.name)) };
  } catch (e) {
    lastError = e.message;
    return { ok: false, error: e.message, containers: [] };
  }
}

export async function dockerInfo() {
  try {
    const [info, version] = await Promise.all([docker.info(), docker.version()]);
    return {
      ok: true,
      name: info.Name,
      os: info.OperatingSystem,
      kernel: info.KernelVersion,
      cpus: info.NCPU,
      memTotal: info.MemTotal,
      dockerVersion: version.Version,
      containers: info.Containers,
      running: info.ContainersRunning,
      stopped: info.ContainersStopped,
      images: info.Images,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function dockerStatus() {
  return { lastOk, lastError, host: config.dockerHost };
}

function findContainer(idOrName) {
  return docker.getContainer(idOrName);
}

/** Ambil N baris log terakhir sebagai teks */
export async function containerLogs(idOrName, tail = 200) {
  const c = findContainer(idOrName);
  const buf = await c.logs({ stdout: true, stderr: true, tail, timestamps: true });
  return demuxLogs(buf);
}

// Log docker (non-TTY) memakai header 8 byte per frame
function demuxLogs(buf) {
  if (!Buffer.isBuffer(buf)) return String(buf);
  const out = [];
  let i = 0;
  const looksMultiplexed = buf.length >= 8 && [0, 1, 2].includes(buf[0]) && buf[1] === 0 && buf[2] === 0 && buf[3] === 0;
  if (!looksMultiplexed) return buf.toString('utf8');
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i + 4);
    out.push(buf.subarray(i + 8, i + 8 + len).toString('utf8'));
    i += 8 + len;
  }
  return out.join('');
}

/** Statistik sekali ambil: CPU% & memori */
export async function containerStats(idOrName) {
  const s = await findContainer(idOrName).stats({ stream: false });
  const cpuDelta = s.cpu_stats.cpu_usage.total_usage - (s.precpu_stats.cpu_usage?.total_usage || 0);
  const sysDelta = s.cpu_stats.system_cpu_usage - (s.precpu_stats.system_cpu_usage || 0);
  const cpus = s.cpu_stats.online_cpus || s.cpu_stats.cpu_usage.percpu_usage?.length || 1;
  const cpu = sysDelta > 0 ? (cpuDelta / sysDelta) * cpus * 100 : 0;
  const cache = s.memory_stats.stats?.inactive_file || s.memory_stats.stats?.cache || 0;
  return {
    cpuPercent: Math.round(cpu * 10) / 10,
    memUsage: (s.memory_stats.usage || 0) - cache,
    memLimit: s.memory_stats.limit || 0,
  };
}

export const CONTAINER_ACTIONS = ['start', 'stop', 'restart'];

/** Jalankan start/stop/restart. Melempar error bila container dilindungi. */
export async function containerAction(name, action) {
  if (!CONTAINER_ACTIONS.includes(action)) throw new Error(`Aksi tidak dikenal: ${action}`);
  const { containers } = await listContainers();
  const target = containers.find((c) => c.name === name || c.shortId === name || c.id === name);
  if (!target) throw new Error(`Container "${name}" tidak ditemukan`);
  if (target.protected) throw new Error(`Container "${target.name}" dilindungi dan tidak boleh di-${action} dari dashboard`);
  const c = findContainer(target.id);
  if (action === 'start') await c.start();
  if (action === 'stop') await c.stop({ t: 20 });
  if (action === 'restart') await c.restart({ t: 20 });
  return target;
}
