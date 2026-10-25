import { Router } from '../lib/router.js';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import {
  COOKIE_NAME,
  cookieOptions,
  loginRateLimit,
  requireAuth,
  resetLoginAttempts,
  signToken,
} from '../lib/auth.js';

const r = Router();

r.post('/login', loginRateLimit, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi' });
  const user = await prisma.user.findUnique({ where: { username: String(username) } });
  if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }
  resetLoginAttempts(req.ip);
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
  res.json({ user: { id: user.id, username: user.username } });
});

r.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

r.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.sub, username: req.user.username } });
});

r.post('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'Password baru minimal 8 karakter' });
  }
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user || !(await bcrypt.compare(String(currentPassword || ''), user.passwordHash))) {
    return res.status(400).json({ error: 'Password lama salah' });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(String(newPassword), 12) },
  });
  res.json({ ok: true });
});

export default r;
