import fs from 'node:fs/promises';
import { config } from '../config.js';

/** Terjemahkan path host NAS (/mnt/data/...) ke path di dalam container (/host/data/...) */
export function toContainerPath(hostPath) {
  if (!hostPath) return null;
  for (const m of config.hostMounts) {
    if (hostPath === m.hostPath || hostPath.startsWith(m.hostPath + '/')) {
      return m.containerPath + hostPath.slice(m.hostPath.length);
    }
  }
  return null;
}

/** Cek apakah lokasi project benar-benar ada di NAS. null = tidak bisa dicek (di luar mount) */
export async function locationExists(hostPath) {
  const p = toContainerPath(hostPath);
  if (!p) return null;
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Kapasitas disk dari setiap mount */
export async function diskUsage() {
  const out = [];
  for (const m of config.hostMounts) {
    try {
      const s = await fs.statfs(m.containerPath);
      const total = s.blocks * s.bsize;
      const free = s.bavail * s.bsize;
      out.push({ path: m.hostPath, total, free, used: total - free });
    } catch (e) {
      out.push({ path: m.hostPath, error: e.code || e.message });
    }
  }
  return out;
}
