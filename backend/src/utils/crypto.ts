import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey() {
  return createHash('sha256').update(env.DATA_ENCRYPTION_KEY, 'utf8').digest();
}

export function encryptSensitiveValue(value: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSensitiveValue(payload: string): string {
  const [ivPart, tagPart, encryptedPart] = payload.split('.');
  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error('Invalid encrypted payload');
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
