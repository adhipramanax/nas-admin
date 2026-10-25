export function bytes(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export function timeAgo(ts) {
  if (!ts) return '-';
  const d = typeof ts === 'number' ? ts : new Date(ts).getTime();
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 60) return `${s} dtk lalu`;
  if (s < 3600) return `${Math.round(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.round(s / 3600)} jam lalu`;
  return `${Math.round(s / 86400)} hari lalu`;
}

export function dateTime(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export const STATUS_LABEL = {
  aktif: 'Aktif',
  development: 'Development',
  maintenance: 'Maintenance',
  nonaktif: 'Nonaktif',
  arsip: 'Arsip',
};

export const CATEGORY_LABEL = {
  web: 'Website',
  app: 'Aplikasi',
  infra: 'Infrastruktur',
  database: 'Database',
  tool: 'Tool',
  lainnya: 'Lainnya',
};

export const STATUSES = Object.keys(STATUS_LABEL);
export const CATEGORIES = Object.keys(CATEGORY_LABEL);
