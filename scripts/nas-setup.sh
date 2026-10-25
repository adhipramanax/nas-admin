#!/bin/bash
# Setup NAS Admin di TrueNAS: deploy pertama + self-hosted runner CI/CD.
# Dijalankan sebagai root di NAS. Argumen 1 (opsional): token registrasi runner GitHub.
set -euo pipefail

REPO_SSH="git@github.com:adhipramanax/nas-admin.git"
REPO_URL="https://github.com/adhipramanax/nas-admin"
DEPLOY_DIR="/mnt/data/app/web/nasAdmin"
RUNNER_DIR="/mnt/data/app/github-runner-nas-admin"
APP_PORT=8002
NAS_IP="192.168.110.10"
RUNNER_TOKEN="${1:-}"

step() { echo; echo "==== $* ===="; }

step "1. Cek port $APP_PORT"
if ss -ltnH "sport = :$APP_PORT" | grep -q . && ! docker ps --format '{{.Names}}' | grep -q '^nas-admin-app$'; then
  echo "ERROR: port $APP_PORT sudah dipakai layanan lain:"; ss -ltnp "sport = :$APP_PORT"; exit 1
fi
echo "Port $APP_PORT tersedia"

step "2. Ambil source code"
if [ -d "$DEPLOY_DIR/.git" ]; then
  git -C "$DEPLOY_DIR" pull --ff-only
elif [ -d "$DEPLOY_DIR" ] && [ -n "$(ls -A "$DEPLOY_DIR" 2>/dev/null)" ]; then
  echo "Folder $DEPLOY_DIR sudah ada (dikelola CI) - lewati clone"
else
  mkdir -p "$(dirname "$DEPLOY_DIR")"
  git clone "$REPO_SSH" "$DEPLOY_DIR"
fi
cd "$DEPLOY_DIR"

step "3. Buat .env"
NEW_ADMIN_PASS=""
if [ ! -f .env ]; then
  NEW_ADMIN_PASS="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 16)"
  # Deteksi port Ollama dari container yang berjalan
  OLLAMA_PORT="$(docker ps --format '{{.Image}} {{.Ports}}' | grep -i ollama | grep -oE '0\.0\.0\.0:[0-9]+->11434' | head -1 | cut -d: -f2 | cut -d- -f1 || true)"
  OLLAMA_PORT="${OLLAMA_PORT:-11434}"
  sed \
    -e "s|^APP_PORT=.*|APP_PORT=$APP_PORT|" \
    -e "s|^NAS_LAN_IP=.*|NAS_LAN_IP=$NAS_IP|" \
    -e "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$NEW_ADMIN_PASS|" \
    -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 16)|" \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" \
    -e "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(openssl rand -hex 32)|" \
    -e "s|^OLLAMA_URL=.*|OLLAMA_URL=http://host.docker.internal:$OLLAMA_PORT|" \
    .env.example > .env
  chmod 600 .env
  echo ".env dibuat (Ollama port terdeteksi: $OLLAMA_PORT)"
else
  echo ".env sudah ada - tidak diubah"
fi

step "4. Build & jalankan container"
docker compose up -d --build --remove-orphans

step "5. Health check"
ok=0
for i in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 3
done
if [ "$ok" = 1 ]; then echo "NAS Admin berjalan di http://$NAS_IP:$APP_PORT"; else
  echo "ERROR: aplikasi belum sehat. Log:"; docker compose logs --tail 60 app; exit 1; fi

step "6. Self-hosted runner GitHub Actions"
if [ -f "$RUNNER_DIR/.runner" ]; then
  echo "Runner sudah terpasang di $RUNNER_DIR"
elif [ -z "$RUNNER_TOKEN" ]; then
  echo "LEWATI: token runner tidak diberikan. Jalankan ulang script dengan token untuk mengaktifkan CI/CD."
else
  mkdir -p "$RUNNER_DIR" && cd "$RUNNER_DIR"
  VER="$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | grep -oE '"tag_name": *"v[^"]+"' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
  echo "Mengunduh actions-runner v$VER"
  curl -fsSL -o runner.tar.gz "https://github.com/actions/runner/releases/download/v$VER/actions-runner-linux-x64-$VER.tar.gz"
  tar xzf runner.tar.gz && rm runner.tar.gz
  RUNNER_ALLOW_RUNASROOT=1 ./config.sh --unattended --replace \
    --url "$REPO_URL" --token "$RUNNER_TOKEN" \
    --name "truenas-nas-admin" --labels "nas-admin" --work _work
  ./svc.sh install root
  # Runner berjalan sebagai root (sama seperti runner lain di NAS)
  SVC="$(cat .service)"
  mkdir -p "/etc/systemd/system/$SVC.d"
  printf '[Service]\nEnvironment=RUNNER_ALLOW_RUNASROOT=1\n' > "/etc/systemd/system/$SVC.d/override.conf"
  systemctl daemon-reload
  ./svc.sh start
  ./svc.sh status | head -5 || true
fi

step "SELESAI"
echo "Dashboard : http://$NAS_IP:$APP_PORT"
if [ -n "$NEW_ADMIN_PASS" ]; then
  echo "Login     : $(grep '^ADMIN_USERNAME=' "$DEPLOY_DIR/.env" | cut -d= -f2) / $NEW_ADMIN_PASS"
  echo "            (segera ganti di menu Pengaturan; tersimpan juga di $DEPLOY_DIR/.env)"
fi
echo "PENTING   : backup ENCRYPTION_KEY di $DEPLOY_DIR/.env"
