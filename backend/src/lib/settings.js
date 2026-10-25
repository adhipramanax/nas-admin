import { prisma } from './prisma.js';

const DEFAULTS = {
  ollamaUrl: process.env.OLLAMA_URL || 'http://host.docker.internal:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
};

export async function getSettings() {
  const rows = await prisma.setting.findMany();
  const out = { ...DEFAULTS };
  for (const r of rows) if (r.key in DEFAULTS) out[r.key] = r.value;
  return out;
}

export async function setSetting(key, value) {
  if (!(key in DEFAULTS)) throw Object.assign(new Error(`Pengaturan tidak dikenal: ${key}`), { status: 400 });
  await prisma.setting.upsert({
    where: { key },
    update: { value: String(value) },
    create: { key, value: String(value) },
  });
}
