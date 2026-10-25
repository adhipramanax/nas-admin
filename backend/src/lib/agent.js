// AI agent berbasis Ollama (tool-calling) untuk mengelola dokumentasi & container NAS.
import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { config } from '../config.js';
import { getSettings } from './settings.js';
import { containerAction, containerLogs, containerStats, listContainers } from './docker.js';
import { findFreePort, getPortTable, getProject, getProjects, uniqueSlug } from './inventory.js';
import { checkProject } from './health.js';
import { diskUsage } from './system.js';
import { logActivity } from './activity.js';
import { cleanProject, STATUSES, CATEGORIES } from '../routes/projects.js';

const MAX_STEPS = 8;
const MAX_TOOL_CHARS = 6000;

// ===== Aksi container yang menunggu konfirmasi user =====
const pending = new Map(); // id -> { id, container, action, reason, createdAt }
const PENDING_TTL = 10 * 60 * 1000;

function cleanupPending() {
  const now = Date.now();
  for (const [id, a] of pending) if (now - a.createdAt > PENDING_TTL) pending.delete(id);
}

export function getPending(id) {
  cleanupPending();
  return pending.get(id) || null;
}

export async function confirmPending(id) {
  const a = getPending(id);
  if (!a) throw Object.assign(new Error('Aksi tidak ditemukan atau sudah kedaluwarsa (10 menit)'), { status: 404 });
  pending.delete(id);
  try {
    const c = await containerAction(a.container, a.action);
    await logActivity({ actor: 'ai', action: `container.${a.action}`, target: c.name, detail: `Dikonfirmasi user. Alasan AI: ${a.reason || '-'}` });
    return { ok: true, message: `Container ${c.name} berhasil di-${a.action}.` };
  } catch (e) {
    const msg = e.statusCode === 304 ? 'Container sudah dalam kondisi tersebut' : e.message;
    await logActivity({ actor: 'ai', action: `container.${a.action}`, target: a.container, detail: msg, success: false });
    return { ok: false, message: `Gagal ${a.action} ${a.container}: ${msg}` };
  }
}

export function cancelPending(id) {
  return pending.delete(id);
}

// ===== Definisi tools =====
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const EDITABLE = ['description', 'status', 'category', 'stack', 'location', 'repoUrl', 'branch', 'localUrl', 'publicUrl', 'healthUrl', 'composeProject', 'docs', 'notes'];

const TOOLS = [
  {
    name: 'get_overview',
    description: 'Ringkasan kondisi NAS: jumlah project, container running/stop, kesehatan web, kapasitas disk.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_projects',
    description: 'Daftar semua project yang terdokumentasi beserta status, port, URL dan status live container.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_project',
    description: 'Detail lengkap satu project termasuk dokumentasi markdown, lokasi, repo, container dan port. Password TIDAK termasuk.',
    parameters: { type: 'object', properties: { slug: str('slug atau nama project') }, required: ['slug'] },
  },
  {
    name: 'list_containers',
    description: 'Daftar semua container Docker di NAS (nama, image, state, port, compose project).',
    parameters: { type: 'object', properties: { filter: str('opsional: kata kunci nama/image/compose project') } },
  },
  {
    name: 'get_container_logs',
    description: 'Ambil baris log terakhir sebuah container untuk analisis error.',
    parameters: {
      type: 'object',
      properties: { container: str('nama container'), lines: { type: 'integer', description: 'jumlah baris (default 80, maks 300)' } },
      required: ['container'],
    },
  },
  {
    name: 'get_container_stats',
    description: 'Pemakaian CPU dan memori sebuah container yang sedang berjalan.',
    parameters: { type: 'object', properties: { container: str('nama container') }, required: ['container'] },
  },
  {
    name: 'list_ports',
    description: 'Tabel semua port yang terpakai di NAS (otomatis dari Docker + dokumentasi manual), termasuk konflik.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'find_free_port',
    description: 'Cari port yang masih kosong untuk project baru.',
    parameters: {
      type: 'object',
      properties: { from: { type: 'integer', description: 'mulai dari port (default 8000)' }, count: { type: 'integer', description: 'jumlah port (default 3)' } },
    },
  },
  {
    name: 'check_project_health',
    description: 'Cek sekarang apakah web sebuah project bisa diakses (HTTP status & waktu respon).',
    parameters: { type: 'object', properties: { slug: str('slug atau nama project') }, required: ['slug'] },
  },
  {
    name: 'update_project',
    description: `Ubah data/dokumentasi project. Field yang boleh diubah: ${EDITABLE.join(', ')}. status: ${STATUSES.join('|')}. Mengisi "docs" akan MENGGANTI seluruh dokumentasi — untuk menambah gunakan append_project_docs.`,
    parameters: {
      type: 'object',
      properties: {
        slug: str('slug atau nama project'),
        fields: { type: 'object', description: 'objek field yang diubah, mis. {"status":"maintenance"}' },
      },
      required: ['slug', 'fields'],
    },
  },
  {
    name: 'append_project_docs',
    description: 'Tambahkan satu bagian baru (markdown) di akhir dokumentasi project tanpa menghapus isi lama.',
    parameters: {
      type: 'object',
      properties: { slug: str('slug atau nama project'), title: str('judul bagian'), content: str('isi markdown') },
      required: ['slug', 'title', 'content'],
    },
  },
  {
    name: 'create_project',
    description: `Buat dokumentasi project baru. category: ${CATEGORIES.join('|')}.`,
    parameters: {
      type: 'object',
      properties: {
        name: str('nama project'),
        description: str('deskripsi singkat'),
        category: str('kategori'),
        status: str('status'),
        stack: str('teknologi'),
        location: str('path di NAS'),
        localUrl: str('URL lokal'),
        composeProject: str('nama compose project Docker untuk tautan otomatis'),
        docs: str('dokumentasi markdown awal'),
      },
      required: ['name'],
    },
  },
  {
    name: 'add_port',
    description: 'Catat port secara manual (untuk layanan yang bukan container Docker, mis. SSH atau TrueNAS UI).',
    parameters: {
      type: 'object',
      properties: {
        port: { type: 'integer' },
        protocol: str('tcp atau udp'),
        service: str('nama layanan'),
        description: str('keterangan'),
        project_slug: str('opsional: slug project pemilik'),
      },
      required: ['port', 'service'],
    },
  },
  {
    name: 'request_container_action',
    description: 'Minta start/stop/restart container. Aksi TIDAK langsung dijalankan: pengguna harus menekan tombol konfirmasi. Selalu jelaskan alasannya.',
    parameters: {
      type: 'object',
      properties: {
        container: str('nama container'),
        action: str('start | stop | restart', { enum: ['start', 'stop', 'restart'] }),
        reason: str('alasan singkat kenapa aksi ini perlu'),
      },
      required: ['container', 'action', 'reason'],
    },
  },
];

async function resolveProject(slugOrName) {
  if (!slugOrName) throw new Error('slug wajib diisi');
  const s = String(slugOrName).trim();
  let p = await prisma.project.findUnique({ where: { slug: s } });
  if (!p) {
    const all = await prisma.project.findMany();
    const low = s.toLowerCase();
    p = all.find((x) => x.name.toLowerCase() === low) || all.find((x) => x.slug.includes(low) || x.name.toLowerCase().includes(low));
  }
  if (!p) throw new Error(`Project "${s}" tidak ditemukan. Gunakan list_projects untuk melihat slug yang ada.`);
  return p;
}

const handlers = {
  async get_overview() {
    const [{ projects, docker }, c, disks] = await Promise.all([getProjects(), listContainers(), diskUsage()]);
    return {
      docker,
      projects: projects.length,
      containers: { total: c.containers.length, running: c.containers.filter((x) => x.state === 'running').length },
      stoppedContainers: c.containers.filter((x) => x.state !== 'running').map((x) => x.name),
      webDown: projects.filter((p) => p.live.health && !p.live.health.ok).map((p) => ({ name: p.name, error: p.live.health.error || p.live.health.status })),
      disks: disks.map((d) => (d.error ? d : { path: d.path, usedGB: +(d.used / 1e9).toFixed(1), totalGB: +(d.total / 1e9).toFixed(1) })),
    };
  },
  async list_projects() {
    const { projects } = await getProjects();
    return projects.map((p) => ({
      slug: p.slug, name: p.name, status: p.status, category: p.category, stack: p.stack,
      localUrl: p.localUrl, publicUrl: p.publicUrl, location: p.location,
      ports: [...new Set([...p.live.publishedPorts, ...p.ports.map((x) => x.port)])],
      live: `${p.live.state} (${p.live.running}/${p.live.total})`,
      health: p.live.health ? (p.live.health.ok ? `OK ${p.live.health.status}` : `DOWN ${p.live.health.error || p.live.health.status}`) : null,
    }));
  },
  async get_project({ slug }) {
    const base = await resolveProject(slug);
    const p = await getProject(base.id);
    return {
      ...p,
      credentials: p.credentials.map((c) => ({ label: c.label, url: c.url, hasPassword: c.hasSecret })),
    };
  },
  async list_containers({ filter } = {}) {
    const { ok, error, containers } = await listContainers();
    if (!ok) return { error: `Docker tidak terhubung: ${error}` };
    const f = (filter || '').toLowerCase();
    return containers
      .filter((c) => !f || [c.name, c.image, c.composeProject].some((v) => v?.toLowerCase().includes(f)))
      .map((c) => ({
        name: c.name, image: c.image, state: c.state, status: c.status, composeProject: c.composeProject,
        ports: c.ports.filter((p) => p.public).map((p) => `${p.public}->${p.private}/${p.type}`), protected: c.protected,
      }));
  },
  async get_container_logs({ container, lines = 80 }) {
    const logs = await containerLogs(container, Math.min(Number(lines) || 80, 300));
    return logs.slice(-MAX_TOOL_CHARS);
  },
  async get_container_stats({ container }) {
    const s = await containerStats(container);
    return { cpuPercent: s.cpuPercent, memMB: Math.round(s.memUsage / 1048576), memLimitMB: Math.round(s.memLimit / 1048576) };
  },
  async list_ports() {
    const { ports } = await getPortTable();
    return ports.map((p) => ({
      port: `${p.port}/${p.protocol}`, active: p.active, conflict: p.conflict,
      used_by: [...p.docker.map((d) => `${d.container}${d.project ? ` (${d.project.name})` : ''}`), ...p.manual.map((m) => `${m.service} [manual]`)],
    }));
  },
  async find_free_port({ from = 8000, count = 3 } = {}) {
    return { freePorts: await findFreePort(Number(from) || 8000, (Number(from) || 8000) + 1000, Math.min(Number(count) || 3, 10)) };
  },
  async check_project_health({ slug }) {
    const p = await resolveProject(slug);
    const r = await checkProject(p);
    return r || { error: `Project ${p.name} belum punya healthUrl` };
  },
  async update_project({ slug, fields }) {
    const p = await resolveProject(slug);
    if (typeof fields === 'string') fields = JSON.parse(fields);
    const allowed = Object.fromEntries(Object.entries(fields || {}).filter(([k]) => EDITABLE.includes(k)));
    if (!Object.keys(allowed).length) throw new Error(`Tidak ada field valid. Boleh: ${EDITABLE.join(', ')}`);
    const data = cleanProject(allowed, true);
    await prisma.project.update({ where: { id: p.id }, data });
    await logActivity({ actor: 'ai', action: 'project.update', target: p.name, detail: `Field: ${Object.keys(data).join(', ')}` });
    return { ok: true, updated: Object.keys(data) };
  },
  async append_project_docs({ slug, title, content }) {
    const p = await resolveProject(slug);
    const docs = `${p.docs ? p.docs.trimEnd() + '\n\n' : ''}## ${title}\n\n${content}`;
    await prisma.project.update({ where: { id: p.id }, data: { docs } });
    await logActivity({ actor: 'ai', action: 'project.docs.append', target: p.name, detail: title });
    return { ok: true };
  },
  async create_project(args) {
    const data = cleanProject(args);
    data.slug = await uniqueSlug(data.name);
    const p = await prisma.project.create({ data });
    await logActivity({ actor: 'ai', action: 'project.create', target: p.name });
    return { ok: true, slug: p.slug };
  },
  async add_port({ port, protocol = 'tcp', service, description, project_slug }) {
    const project = project_slug ? await resolveProject(project_slug) : null;
    const n = Number(port);
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('Port tidak valid');
    const p = await prisma.port.create({
      data: { port: n, protocol: protocol === 'udp' ? 'udp' : 'tcp', service, description: description || null, projectId: project?.id || null },
    });
    await logActivity({ actor: 'ai', action: 'port.create', target: `${p.port}/${p.protocol} ${service}` });
    return { ok: true };
  },
  async request_container_action({ container, action, reason }, ctx) {
    if (!['start', 'stop', 'restart'].includes(action)) throw new Error('action harus start, stop, atau restart');
    const { containers } = await listContainers();
    const target = containers.find((c) => c.name === container) || containers.find((c) => c.name.includes(container));
    if (!target) throw new Error(`Container "${container}" tidak ditemukan`);
    if (target.protected) throw new Error(`Container ${target.name} dilindungi, tidak boleh di-${action}`);
    const a = { id: crypto.randomUUID(), container: target.name, action, reason: reason || '', state: target.state, createdAt: Date.now() };
    pending.set(a.id, a);
    ctx.pendingActions.push(a);
    return { status: 'MENUNGGU_KONFIRMASI', message: `Permintaan ${action} untuk ${target.name} ditampilkan ke pengguna. Aksi baru dijalankan setelah pengguna menekan Konfirmasi.` };
  },
};

function systemPrompt() {
  return `Kamu adalah "NAS Assistant", AI agent yang mengelola server TrueNAS SCALE milik Panji (IP LAN ${config.nasLanIp}).
Tugasmu: menjawab pertanyaan tentang project, container Docker, port, status web dan dokumentasi di NAS, menganalisis log, serta merapikan dokumentasi.

Aturan:
- Selalu jawab dalam Bahasa Indonesia, ringkas dan jelas.
- JANGAN mengarang data. Gunakan tools untuk mengambil data terbaru sebelum menjawab tentang kondisi NAS.
- Kamu tidak punya akses ke password. Jika ditanya password, arahkan pengguna membuka halaman project di dashboard.
- Untuk start/stop/restart container WAJIB memakai tool request_container_action; aksi baru jalan setelah pengguna konfirmasi. Jangan bilang aksi sudah dilakukan.
- Sebelum menyarankan restart, sebaiknya cek log container terlebih dahulu.
- Saat mengubah dokumentasi, sebutkan apa yang diubah.
- Tanggal hari ini: ${new Date().toISOString().slice(0, 10)}.`;
}

function parseArgs(a) {
  if (!a) return {};
  if (typeof a === 'string') {
    try { return JSON.parse(a); } catch { return {}; }
  }
  return a;
}

async function ollamaChat(settings, messages) {
  const res = await fetch(`${settings.ollamaUrl.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: settings.ollamaModel,
      messages,
      tools: TOOLS.map((t) => ({ type: 'function', function: t })),
      stream: false,
      options: { temperature: 0.2, num_ctx: 8192 },
    }),
    signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT_MS || 180000)),
  });
  if (!res.ok) {
    const text = await res.text();
    if (/does not support tools/i.test(text)) {
      throw new Error(`Model "${settings.ollamaModel}" tidak mendukung tool-calling. Ganti ke qwen2.5, llama3.1, atau mistral-nemo di Pengaturan.`);
    }
    if (/not found/i.test(text)) throw new Error(`Model "${settings.ollamaModel}" belum di-pull di Ollama. Jalankan: ollama pull ${settings.ollamaModel}`);
    throw new Error(`Ollama error ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Jalankan satu giliran percakapan.
 * history: [{role:'user'|'assistant', content}]
 */
export async function runAgent(history) {
  const settings = await getSettings();
  const ctx = { pendingActions: [], trace: [] };
  const messages = [
    { role: 'system', content: systemPrompt() },
    ...history
      .filter((m) => ['user', 'assistant'].includes(m.role) && m.content)
      .slice(-20)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 8000) })),
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    const data = await ollamaChat(settings, messages);
    const msg = data.message || {};
    messages.push(msg);
    const calls = msg.tool_calls || [];
    if (!calls.length) {
      return { reply: msg.content || '(tidak ada jawaban)', trace: ctx.trace, pendingActions: ctx.pendingActions, model: settings.ollamaModel };
    }
    for (const call of calls) {
      const name = call.function?.name;
      const args = parseArgs(call.function?.arguments);
      let result;
      let ok = true;
      try {
        if (!handlers[name]) throw new Error(`Tool tidak dikenal: ${name}`);
        result = await handlers[name](args, ctx);
      } catch (e) {
        ok = false;
        result = { error: e.message };
      }
      ctx.trace.push({ tool: name, args, ok });
      let content = typeof result === 'string' ? result : JSON.stringify(result);
      if (content.length > MAX_TOOL_CHARS) content = content.slice(0, MAX_TOOL_CHARS) + '…(dipotong)';
      messages.push({ role: 'tool', tool_name: name, content });
    }
  }
  return {
    reply: 'Maaf, saya butuh terlalu banyak langkah untuk pertanyaan ini. Coba pertanyaan yang lebih spesifik.',
    trace: ctx.trace,
    pendingActions: ctx.pendingActions,
    model: settings.ollamaModel,
  };
}

export async function ollamaStatus() {
  const settings = await getSettings();
  try {
    const res = await fetch(`${settings.ollamaUrl.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    return {
      ok: true,
      url: settings.ollamaUrl,
      model: settings.ollamaModel,
      models,
      modelInstalled: models.some((m) => m === settings.ollamaModel || m === `${settings.ollamaModel}:latest`),
    };
  } catch (e) {
    return { ok: false, url: settings.ollamaUrl, model: settings.ollamaModel, models: [], error: e.cause?.code || e.message };
  }
}

// Untuk pengujian
export const _internal = { TOOLS, handlers };
