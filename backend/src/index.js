import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { requireAuth } from './lib/auth.js';
import { startHealthLoop } from './lib/health.js';
import authRoutes from './routes/auth.js';
import projectRoutes, { credentialRouter } from './routes/projects.js';
import portRoutes from './routes/ports.js';
import dockerRoutes from './routes/docker.js';
import systemRoutes from './routes/system.js';
import agentRoutes from './routes/agent.js';

const app = express();
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Header keamanan dasar
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/projects', requireAuth, projectRoutes);
app.use('/api/credentials', requireAuth, credentialRouter);
app.use('/api/ports', requireAuth, portRoutes);
app.use('/api/docker', requireAuth, dockerRoutes);
app.use('/api/system', requireAuth, systemRoutes);
app.use('/api/agent', requireAuth, agentRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));

// Frontend hasil build (React) disajikan dari origin yang sama -> cookie aman & tanpa CORS
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
}

// Error handler
app.use((err, req, res, _next) => {
  if (err.code === 'P2025') return res.status(404).json({ error: 'Data tidak ditemukan' });
  if (err.code === 'P2002') return res.status(409).json({ error: 'Data sudah ada' });
  if (err.statusCode === 404 && err.reason) return res.status(404).json({ error: 'Container tidak ditemukan' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Terjadi kesalahan server' });
});

app.listen(config.port, () => {
  console.log(`[nas-admin] berjalan di port ${config.port}`);
  startHealthLoop();
});
