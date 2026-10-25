#!/bin/sh
set -e
echo "[nas-admin] Menjalankan migrasi database..."
npx prisma migrate deploy
echo "[nas-admin] Seed data awal (hanya jika kosong)..."
node prisma/seed.js
echo "[nas-admin] Menjalankan server..."
exec node src/index.js
