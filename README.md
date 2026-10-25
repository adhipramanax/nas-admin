# NAS Admin

Dashboard dokumentasi & monitoring untuk TrueNAS SCALE — semua project, container, port, status web, lokasi, dan akses admin di satu tempat, plus **NAS Assistant** (AI agent berbasis Ollama).

![stack](https://img.shields.io/badge/React-Vite-blue) ![stack](https://img.shields.io/badge/Express-Prisma-green) ![stack](https://img.shields.io/badge/PostgreSQL-16-336791)

## Fitur

| Halaman | Isi |
|---|---|
| **Ringkasan** | Container running, web online/down, konflik port, kapasitas disk, info host, aktivitas terbaru, peringatan |
| **Project** | Dokumentasi tiap project: status, stack, lokasi (dicek ada/tidak), repo, URL lokal & publik, tag, dokumentasi Markdown, akses admin |
| **Container** | Semua container Docker (otomatis), dikelompokkan per compose project, log viewer, start/stop/restart (dengan konfirmasi) |
| **Port** | Port dari Docker (otomatis) + port manual, deteksi konflik, cek port listen, cari port kosong |
| **Pengaturan** | Model & URL Ollama, ganti password, export Markdown/JSON, riwayat aktivitas |
| **NAS Assistant** | Chat AI: tanya kondisi NAS, analisis log, cari port kosong, tulis/rapikan dokumentasi, minta start/stop/restart container (wajib konfirmasi) |

**Keamanan**
- Hanya LAN, login JWT di cookie httpOnly, rate-limit login.
- Password akses admin disimpan **terenkripsi AES-256-GCM**; tampil hanya saat diklik dan tersembunyi otomatis setelah 30 detik. AI agent **tidak punya akses** ke password.
- Docker diakses lewat **socket-proxy**: hanya baca + start/stop/restart. Tidak bisa membuat/menghapus container, image, volume, atau `exec`.
- Container dashboard sendiri (`nas-admin-*`) dilindungi dari stop/restart. Tambahkan lewat `PROTECTED_CONTAINERS`.
- Semua aksi container & perubahan oleh AI dicatat di riwayat aktivitas.

## Struktur

```
nas-admin/
├─ backend/            Express + Prisma (API, Docker, health check, AI agent)
│  ├─ prisma/          schema, migrasi, seed data awal
│  └─ src/
│     ├─ lib/          docker, crypto, health, inventory, agent (Ollama)
│     └─ routes/       auth, projects, ports, docker, system, agent
├─ frontend/           React + Vite + Tailwind
├─ docker/entrypoint.sh
├─ Dockerfile          build frontend + backend jadi 1 image
└─ docker-compose.yml  app + postgres + socket-proxy
```

---

## Deploy ke TrueNAS (langkah demi langkah)

### Langkah 1 — Salin project ke NAS

Lewat Git (disarankan, sama seperti project lain):

```bash
# di Windows (F:\Project\WebSite\nas-admin)
git init && git add . && git commit -m "init nas-admin"
git remote add origin git@github.com:adhipramanax/nas-admin.git
git push -u origin master

# di TrueNAS (SSH)
cd /mnt/data/app/web
git clone git@github.com:adhipramanax/nas-admin.git nasAdmin
cd nasAdmin
```

> Pastikan `.gitattributes` ikut ter-commit agar `entrypoint.sh` tetap berakhiran LF.

### Langkah 2 — Buat file `.env`

```bash
cp .env.example .env
openssl rand -hex 32   # salin hasilnya ke JWT_SECRET
openssl rand -hex 32   # salin hasilnya ke ENCRYPTION_KEY
nano .env              # isi ADMIN_PASSWORD, DB_PASSWORD, OLLAMA_URL
```

⚠️ **Simpan `ENCRYPTION_KEY` di tempat aman.** Jika hilang/berubah, password yang tersimpan tidak bisa dibuka lagi.

### Langkah 3 — Jalankan

```bash
docker compose up -d --build
docker compose logs -f app     # tunggu "berjalan di port 3000"
```

Buka **http://192.168.110.10:8002** dan login dengan `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

Saat pertama jalan, dashboard otomatis terisi project yang sudah diketahui (pa-admin, basinang, pramitaadhipramana, pramitakubah, portofolio, undangan, Immich, Nextcloud, Ollama, Cloudflare Tunnel, GitHub runner, TrueNAS). Matikan dengan `SEED_PROJECTS=false`.

### Langkah 4 — Cocokkan dengan container

1. Buka **Container** — container yang belum terdokumentasi ditandai kuning.
2. Jika project seed tidak tertaut (badge "Tidak tertaut"), buka project → **Edit** → pilih **Docker compose project** yang benar dari daftar.
3. Untuk container lain: **Project → Import dari Docker** → **Dokumentasikan**.
4. Lengkapi **Akses admin** dan **Dokumentasi** tiap project.

### Langkah 5 — Aktifkan NAS Assistant (Ollama)

Model harus mendukung **tool-calling** (`llama3` lama tidak bisa). Disarankan `qwen2.5:7b`:

```bash
# jika Ollama dari TrueNAS Apps, ganti nama container sesuai yang ada
docker exec -it ix-ollama-ollama-1 ollama pull qwen2.5:7b
```

Lalu di **Pengaturan → NAS Assistant** isi URL Ollama (lihat port Ollama di halaman **Port**, mis. `http://host.docker.internal:30068`) dan pilih model. Status harus hijau "Terhubung".

Contoh perintah ke AI:
- "Bagaimana kondisi NAS saat ini?"
- "Container mana yang mati? Cek log-nya."
- "Restart basinang-web" → muncul kartu **Konfirmasi**, aksi baru jalan setelah diklik.
- "Cari 3 port kosong mulai dari 8000 untuk project baru"
- "Tambahkan bagian cara deploy di dokumentasi pa-admin: …"

---

## Update

```bash
cd /mnt/data/app/web/nasAdmin
git pull
docker compose up -d --build
```

Migrasi database berjalan otomatis saat container start.

## Backup

- **Pengaturan → Export**: Markdown (tanpa password) atau JSON (password tetap terenkripsi).
- Database: `docker exec nas-admin-db pg_dump -U nasadmin nasadmin > nas-admin-$(date +%F).sql` — bisa ditambahkan ke cron backup PostgreSQL yang sudah ada.

## Troubleshooting

| Gejala | Solusi |
|---|---|
| "Docker terputus" | `docker compose logs socket-proxy`. Pastikan `/var/run/docker.sock` ada di host. |
| Semua port "Tertutup" / web "Down" padahal jalan | Ganti `HOST_CHECK_ADDR=192.168.110.10` di `.env`, lalu ubah health URL project ke IP itu. |
| Lokasi project "tidak ditemukan" | Pastikan path diawali `/mnt/data/...` (yang di-mount ke container). Tambah mount lain lewat `HOST_MOUNTS` + `volumes`. |
| AI: "tidak mendukung tool-calling" | Ganti model ke `qwen2.5:7b`, `llama3.1:8b`, atau `mistral-nemo`. |
| AI lambat / timeout | Model 7B di CPU butuh waktu; naikkan `OLLAMA_TIMEOUT_MS` atau pakai model lebih kecil (`qwen2.5:3b`). |
| Lupa password login | `docker exec -it nas-admin-db psql -U nasadmin -c 'DELETE FROM "User";'` lalu `docker compose restart app` — admin dibuat ulang dari `.env`. |

## Development lokal (Windows)

```bash
# Postgres lokal / docker
cd backend
npm install
copy ..\.env.example .env   # isi DATABASE_URL=postgresql://user:pass@localhost:5432/nasadmin
npx prisma migrate deploy && node --env-file=.env prisma/seed.js
npm run dev                  # API di :3000

cd ../frontend
npm install
npm run dev                  # UI di :5173 (proxy /api ke :3000)
```

Tanpa akses Docker, halaman Container akan menampilkan "Docker terputus" — fitur dokumentasi tetap berjalan.

## CI/CD (GitHub Actions)

Setiap `git push` ke branch `master` otomatis men-deploy ke NAS lewat self-hosted runner berlabel `nas-admin`
(`.github/workflows/deploy.yml`):

1. Checkout repo → `rsync` ke `/mnt/data/app/web/nasAdmin` (file `.env` di NAS tidak pernah ditimpa)
2. `docker compose build` + `up -d`
3. Health check `http://127.0.0.1:8002/api/health` — jika gagal, log container ditampilkan di Actions

Deploy manual dari GitHub: tab **Actions → Deploy NAS Admin → Run workflow**.
