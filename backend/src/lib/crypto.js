import crypto from 'node:crypto';
import { config } from '../config.js';

// Kunci 32 byte. Jika ENCRYPTION_KEY berupa hex 64 karakter dipakai langsung,
// selain itu diturunkan dengan SHA-256.
const KEY = /^[0-9a-fA-F]{64}$/.test(config.encryptionKey)
  ? Buffer.from(config.encryptionKey, 'hex')
  : crypto.createHash('sha256').update(config.encryptionKey).digest();

/** Enkripsi teks -> "v1:iv:tag:ciphertext" (base64) */
export function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

export function decrypt(payload) {
  if (!payload) return null;
  const [v, ivB64, tagB64, dataB64] = payload.split(':');
  if (v !== 'v1') throw new Error('Format enkripsi tidak dikenal');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
