import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const COOKIE_NAME = 'nasadmin_token';

export function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, config.jwtSecret, {
    expiresIn: `${config.sessionHours}h`,
  });
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: config.sessionHours * 3600 * 1000,
    path: '/',
  };
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Belum login' });
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Sesi berakhir, silakan login lagi' });
  }
}

// Rate limit sederhana untuk login: maks 10 percobaan / 15 menit per IP
const attempts = new Map();
export function loginRateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const list = (attempts.get(ip) || []).filter((t) => now - t < windowMs);
  if (list.length >= 10) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi 15 menit lagi.' });
  }
  list.push(now);
  attempts.set(ip, list);
  next();
}
export function resetLoginAttempts(ip) {
  attempts.delete(ip);
}
