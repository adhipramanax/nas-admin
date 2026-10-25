# ===== Tahap 1: build frontend React =====
FROM node:20-bookworm-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ===== Tahap 2: backend Express + hasil build frontend =====
FROM node:20-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend/src ./src
COPY --from=web /web/dist ./public
COPY docker/entrypoint.sh /entrypoint.sh
# Antisipasi CRLF dari Windows
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/entrypoint.sh"]
