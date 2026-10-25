// TOTP (RFC 6238) — kompatibel dengan Google Authenticator, Microsoft Authenticator, Authy, dll.
import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30; // detik
const DIGITS = 6;
const WINDOW = 1; // toleransi ±1 langkah (±30 detik) untuk selisih jam

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateSecret() {
  return base32Encode(crypto.randomBytes(20)); // 160 bit
}

export function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(code).padStart(DIGITS, '0');
}

export function currentStep(now = Date.now()) {
  return Math.floor(now / 1000 / STEP);
}

/**
 * Verifikasi kode. Mengembalikan time-step yang cocok, atau null.
 * lastStep: step terakhir yang sudah dipakai — kode yang sama/lebih lama ditolak (anti replay).
 */
export function verifyTotp(secret, code, lastStep = null, now = Date.now()) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const step = currentStep(now);
  for (let w = -WINDOW; w <= WINDOW; w++) {
    const s = step + w;
    if (lastStep !== null && lastStep !== undefined && s <= lastStep) continue;
    const expected = hotp(secret, s);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return s;
  }
  return null;
}

export function otpauthUrl(secret, account, issuer = 'NAS Admin') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP) });
  return `otpauth://totp/${label}?${params}`;
}

// ===== Kode cadangan =====
export function generateRecoveryCodes(n = 10) {
  return Array.from({ length: n }, () => {
    const raw = crypto.randomBytes(5).toString('hex'); // 10 karakter
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export function hashRecoveryCode(code) {
  const norm = String(code).toLowerCase().replace(/[^a-f0-9]/g, '');
  return crypto.createHash('sha256').update(norm).digest('hex');
}
