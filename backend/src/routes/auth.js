import { Router } from '../lib/router.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { logActivity } from '../lib/activity.js';
import {
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCode,
  otpauthUrl,
  verifyTotp,
} from '../lib/totp.js';
import QRCode from 'qrcode';
import {
  COOKIE_NAME,
  cookieOptions,
  loginRateLimit,
  requireAuth,
  resetLoginAttempts,
  signToken,
} from '../lib/auth.js';

const r = Router();

// Cookie sementara antara langkah password dan langkah kode 2FA (5 menit)
const PENDING_COOKIE = 'nasadmin_2fa';
const PENDING_MINUTES = 5;

function pendingCookieOptions() {
  return { ...cookieOptions(), maxAge: PENDING_MINUTES * 60 * 1000 };
}

function finishLogin(res, user) {
  res.clearCookie(PENDING_COOKIE, { path: '/' });
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
  return res.json({ user: { id: user.id, username: user.username } });
}

/**
 * Cek kode TOTP atau kode cadangan. Jika valid, simpan step terakhir / hapus kode cadangan.
 * Return: 'totp' | 'recovery' | null
 */
async function consumeSecondFactor(user, code) {
  const raw = String(code || '').trim();
  if (/^\d{3}\s?\d{3}$/.test(raw)) {
    const secret = decrypt(user.totpSecretEnc);
    const step = verifyTotp(secret, raw, user.totpLastStep);
    if (step === null) return null;
    await prisma.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
    return 'totp';
  }
  const hash = hashRecoveryCode(raw);
  if (raw.length >= 10 && user.recoveryCodes.includes(hash)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { recoveryCodes: user.recoveryCodes.filter((h) => h !== hash) },
    });
    return 'recovery';
  }
  return null;
}

// ===== Login langkah 1: username + password =====
r.post('/login', loginRateLimit, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi' });
  const user = await prisma.user.findUnique({ where: { username: String(username) } });
  if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }
  if (user.totpEnabled) {
    const token = jwt.sign({ sub: user.id, stage: '2fa' }, config.jwtSecret, { expiresIn: `${PENDING_MINUTES}m` });
    res.cookie(PENDING_COOKIE, token, pendingCookieOptions());
    return res.json({ twoFactorRequired: true });
  }
  resetLoginAttempts(req.ip);
  finishLogin(res, user);
});

// ===== Login langkah 2: kode 6 digit / kode cadangan =====
r.post('/login/2fa', loginRateLimit, async (req, res) => {
  let payload;
  try {
    payload = jwt.verify(req.cookies?.[PENDING_COOKIE] || '', config.jwtSecret);
    if (payload.stage !== '2fa') throw new Error();
  } catch {
    return res.status(401).json({ error: 'Sesi verifikasi habis. Silakan login ulang.', restart: true });
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.totpEnabled) return res.status(401).json({ error: 'Silakan login ulang.', restart: true });

  const kind = await consumeSecondFactor(user, req.body?.code);
  if (!kind) return res.status(401).json({ error: 'Kode salah atau sudah dipakai' });
  if (kind === 'recovery') {
    await logActivity({ action: 'auth.recovery_code_used', target: user.username, detail: `Sisa kode cadangan: ${user.recoveryCodes.length - 1}` });
  }
  resetLoginAttempts(req.ip);
  finishLogin(res, user);
});

r.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.clearCookie(PENDING_COOKIE, { path: '/' });
  res.json({ ok: true });
});

r.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user) return res.status(401).json({ error: 'User tidak ditemukan' });
  res.json({ user: { id: user.id, username: user.username, totpEnabled: !!user.totpEnabled } });
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
  await logActivity({ action: 'auth.password_change', target: user.username });
  res.json({ ok: true });
});

// ===== Pengaturan 2FA =====
r.get('/2fa', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  res.json({ enabled: !!user.totpEnabled, recoveryCodesLeft: user.recoveryCodes?.length || 0 });
});

// Mulai setup: buat secret baru (belum aktif sampai dikonfirmasi dengan kode)
r.post('/2fa/setup', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (user.totpEnabled) return res.status(400).json({ error: '2FA sudah aktif. Nonaktifkan dulu untuk mengganti perangkat.' });
  const secret = generateSecret();
  await prisma.user.update({ where: { id: user.id }, data: { totpSecretEnc: encrypt(secret), totpLastStep: null } });
  const url = otpauthUrl(secret, user.username);
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: '#0f172a', light: '#ffffff' } });
  res.json({ secret: secret.match(/.{1,4}/g).join(' '), otpauthUrl: url, qr });
});

// Konfirmasi setup dengan kode dari aplikasi -> aktif + kode cadangan
r.post('/2fa/enable', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (user.totpEnabled) return res.status(400).json({ error: '2FA sudah aktif' });
  if (!user.totpSecretEnc) return res.status(400).json({ error: 'Mulai setup terlebih dahulu' });
  const step = verifyTotp(decrypt(user.totpSecretEnc), req.body?.code, null);
  if (step === null) return res.status(400).json({ error: 'Kode salah. Pastikan jam di HP & NAS sudah sinkron.' });
  const codes = generateRecoveryCodes();
  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: true, totpLastStep: step, recoveryCodes: codes.map(hashRecoveryCode) },
  });
  await logActivity({ action: 'auth.2fa_enable', target: user.username });
  res.json({ ok: true, recoveryCodes: codes });
});

// Buat ulang kode cadangan (butuh kode 2FA saat ini)
r.post('/2fa/recovery-codes', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user.totpEnabled) return res.status(400).json({ error: '2FA belum aktif' });
  if (!(await consumeSecondFactor(user, req.body?.code))) return res.status(400).json({ error: 'Kode salah' });
  const codes = generateRecoveryCodes();
  await prisma.user.update({ where: { id: user.id }, data: { recoveryCodes: codes.map(hashRecoveryCode) } });
  await logActivity({ action: 'auth.2fa_recovery_regenerate', target: user.username });
  res.json({ recoveryCodes: codes });
});

// Nonaktifkan: butuh password + kode 2FA/kode cadangan
r.post('/2fa/disable', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user.totpEnabled) return res.status(400).json({ error: '2FA belum aktif' });
  if (!(await bcrypt.compare(String(req.body?.password || ''), user.passwordHash))) {
    return res.status(400).json({ error: 'Password salah' });
  }
  if (!(await consumeSecondFactor(user, req.body?.code))) return res.status(400).json({ error: 'Kode salah' });
  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: false, totpSecretEnc: null, totpLastStep: null, recoveryCodes: [] },
  });
  await logActivity({ action: 'auth.2fa_disable', target: user.username });
  res.json({ ok: true });
});

export default r;
