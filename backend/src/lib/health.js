import net from 'node:net';
import { config } from '../config.js';
import { prisma } from './prisma.js';

/** Cache hasil health check terakhir: slug -> { ok, status, ms, error, checkedAt } */
export const healthCache = new Map();

export async function httpCheck(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(config.healthTimeoutMs),
    });
    // 2xx/3xx = sehat; 401/403 juga dianggap "hidup" (butuh login)
    const ok = res.status < 400 || res.status === 401 || res.status === 403;
    return { ok, status: res.status, ms: Date.now() - started, checkedAt: Date.now() };
  } catch (e) {
    return {
      ok: false,
      status: null,
      ms: Date.now() - started,
      error: e.name === 'TimeoutError' ? 'Timeout' : e.cause?.code || e.message,
      checkedAt: Date.now(),
    };
  }
}

export function tcpCheck(port, host = config.hostCheckAddr, timeout = 1500) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    const done = (open, error) => {
      socket.destroy();
      resolve({ port, open, ms: Date.now() - started, error });
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false, 'timeout'));
    socket.once('error', (e) => done(false, e.code));
    socket.connect(port, host);
  });
}

export async function checkProject(p) {
  if (!p.healthUrl) return null;
  const r = await httpCheck(p.healthUrl);
  healthCache.set(p.slug, r);
  return r;
}

export async function checkAll() {
  const projects = await prisma.project.findMany({ where: { healthUrl: { not: null } } });
  await Promise.all(projects.map(checkProject));
}

export function startHealthLoop() {
  const run = () => checkAll().catch((e) => console.error('[health]', e.message));
  setTimeout(run, 3000);
  setInterval(run, config.healthInterval * 1000);
}
