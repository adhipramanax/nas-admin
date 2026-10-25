// Seed awal: membuat akun admin & mengisi dokumentasi project yang sudah diketahui.
// Aman dijalankan berulang: admin hanya dibuat jika belum ada user, project hanya
// diisi jika tabel project masih kosong.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const NAS = process.env.NAS_LAN_IP || '192.168.110.10';
const HOST = process.env.HOST_CHECK_ADDR || 'host.docker.internal';

const web = (name, slug, port, extra = {}) => ({
  name,
  slug,
  category: 'web',
  status: 'aktif',
  location: `/mnt/data/app/web/${extra.folder || slug}`,
  composeProject: (extra.folder || slug).toLowerCase(),
  localUrl: port ? `http://${NAS}:${port}` : null,
  healthUrl: port ? `http://${HOST}:${port}` : null,
  branch: 'master',
  ...extra,
  folder: undefined,
  _port: port,
});

const PROJECTS = [
  web('PA Management (pa-admin)', 'pamanagement', 8081, {
    description: 'Sistem manajemen konstruksi CV Pramita Adhipramana.',
    stack: 'React + Vite + Tailwind, Node.js + Express + Prisma, PostgreSQL, Nginx',
    repoUrl: 'https://github.com/adhipramanax/pa-admin',
    tags: ['konstruksi', 'internal'],
    docs: `## Arsitektur
- Frontend React + Vite + Tailwind, disajikan lewat Nginx
- Backend Express + Prisma + PostgreSQL
- Puppeteer (Chromium) untuk generate PDF, PDFKit, Multer untuk upload

## Folder upload (Multer)
\`berkas\`, \`inventaris\`, \`karyawan\`, \`material\`, \`pengajuan\`

## Deploy
CI/CD via GitHub Actions, self-hosted runner di TrueNAS (\`/mnt/data/app/github-runner/\`).`,
  }),
  web('Basinang', 'basinang', 8010, {
    description: 'Website toko souvenir tradisional Basinang.',
    stack: 'Next.js (App Router) + Prisma + PostgreSQL',
    tags: ['bisnis'],
  }),
  web('Pramita Adhipramana', 'pramitaadhipramana', 8005, {
    description: 'Website company profile CV Pramita Adhipramana (dengan AI chat widget Ollama).',
    stack: 'Laravel',
    publicUrl: 'https://pramitaadhipramana.com',
    tags: ['bisnis', 'seo'],
  }),
  web('Pramita Kubah', 'pramitakubah', 8007, {
    description: 'Website Pramita Kubah, rebuild dari WordPress.',
    stack: 'Laravel 13 + Filament',
    tags: ['bisnis'],
  }),
  web('Portofolio Panji', 'portofoliopanji', 8008, {
    folder: 'portofolioPanji',
    description: 'Website portofolio pribadi.',
    stack: 'React + Vite',
  }),
  web('Undangan Pernikahan', 'weddingpanjiacha', null, {
    folder: 'weddingPanjiAcha',
    description: 'Website undangan pernikahan digital.',
    stack: 'Next.js + Prisma',
    status: 'development',
    notes: 'Port belum dicatat — lengkapi setelah dicek di halaman Container.',
  }),
  {
    name: 'Immich',
    slug: 'immich',
    category: 'app',
    status: 'aktif',
    description: 'Manajemen foto self-hosted (dipasang dari katalog TrueNAS Apps).',
    stack: 'TrueNAS App (Docker)',
    composeProject: 'ix-immich',
    notes: 'Dipasang via TrueNAS Apps karena compose manual gagal (dependensi pgvector).',
  },
  {
    name: 'Nextcloud',
    slug: 'nextcloud',
    category: 'app',
    status: 'aktif',
    description: 'Penyimpanan file & sinkronisasi self-hosted.',
    stack: 'TrueNAS App (Docker)',
    composeProject: 'ix-nextcloud',
  },
  {
    name: 'Ollama',
    slug: 'ollama',
    category: 'app',
    status: 'aktif',
    description: 'Server LLM lokal untuk AI chat widget & NAS Assistant.',
    stack: 'Ollama (TrueNAS App)',
    composeProject: 'ix-ollama',
    notes: 'Jika Ollama tidak dipasang via TrueNAS Apps, sesuaikan compose project / nama container.',
  },
  {
    name: 'Cloudflare Tunnel',
    slug: 'cloudflared',
    category: 'infra',
    status: 'aktif',
    description: 'Tunnel publik ke web di NAS + Zero Trust Access (email OTP). Domain terdaftar di Domainesia.',
    stack: 'cloudflared (Docker Compose)',
    composeProject: 'cloudflared',
  },
  {
    name: 'GitHub Actions Runner',
    slug: 'github-runner',
    category: 'infra',
    status: 'aktif',
    description: 'Self-hosted runner untuk CI/CD semua web project.',
    location: '/mnt/data/app/github-runner',
    stack: 'GitHub Actions self-hosted runner',
    docs: `## Catatan
- Akun GitHub: \`adhipramanax\`
- Berjalan sebagai root dengan \`RUNNER_ALLOW_RUNASROOT=1\`
- Pola: gunakan entrypoint script, bukan \`docker exec\` di workflow
- \`su -s /bin/bash github-runner\` lebih disarankan daripada \`sudo -u github-runner\``,
  },
  {
    name: 'Backup PostgreSQL',
    slug: 'backup-postgres',
    category: 'database',
    status: 'aktif',
    description: 'Backup database dengan pg_dump via cron di TrueNAS.',
    stack: 'cron + pg_dump',
  },
];

const SYSTEM_PORTS = [
  { port: 22, service: 'SSH TrueNAS', description: 'Akses SSH ke NAS' },
  { port: 80, service: 'TrueNAS Web UI (HTTP)' },
  { port: 443, service: 'TrueNAS Web UI (HTTPS)' },
];

async function main() {
  if ((await prisma.user.count()) === 0) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD;
    if (!password) throw new Error('ADMIN_PASSWORD wajib diisi untuk membuat akun admin pertama');
    await prisma.user.create({ data: { username, passwordHash: await bcrypt.hash(password, 12) } });
    console.log(`[seed] Akun admin "${username}" dibuat`);
  }

  // Darurat: matikan 2FA user tertentu (HP hilang & kode cadangan hilang).
  // Isi RESET_2FA_USER=<username> di .env, restart, lalu hapus lagi baris tersebut.
  if (process.env.RESET_2FA_USER) {
    const u = await prisma.user.findUnique({ where: { username: process.env.RESET_2FA_USER } });
    if (u) {
      await prisma.user.update({
        where: { id: u.id },
        data: { totpEnabled: false, totpSecretEnc: null, totpLastStep: null, recoveryCodes: [] },
      });
      console.log(`[seed] 2FA untuk "${u.username}" DINONAKTIFKAN (RESET_2FA_USER). Hapus variabel ini dari .env!`);
    }
  }

  if ((await prisma.project.count()) === 0 && process.env.SEED_PROJECTS !== 'false') {
    for (const { _port, folder, ...p } of PROJECTS) {
      const created = await prisma.project.create({ data: p });
      if (_port) {
        await prisma.port.create({ data: { port: _port, service: p.name, projectId: created.id } });
      }
    }
    await prisma.project.create({
      data: {
        name: 'TrueNAS SCALE',
        slug: 'truenas',
        category: 'infra',
        status: 'aktif',
        description: `Server NAS utama (${NAS}).`,
        localUrl: `http://${NAS}`,
        docs: `## Jaringan
ZTE F609 → FiberHome HG6145F → Ruijie EW6000GX → TrueNAS

## Catatan
- Gunakan IP statis — setelah mati listrik, TrueNAS Apps sempat error karena default gateway IPv4 hilang.
- Struktur project web: \`/mnt/data/app/web/<nama-project>\``,
      },
    });
    for (const sp of SYSTEM_PORTS) await prisma.port.create({ data: sp });
    console.log(`[seed] ${PROJECTS.length + 1} project awal ditambahkan`);
  }
}

main()
  .catch((e) => {
    console.error('[seed]', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
