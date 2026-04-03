import { createHmac, randomBytes } from 'crypto';
import { env } from '../config/env';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Buffer) {
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }

  let encoded = '';
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, '0');
    encoded += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
  }

  return encoded;
}

function base32Decode(input: string) {
  const normalized = input.trim().toUpperCase().replace(/=+$/g, '');
  let bits = '';
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) {
      throw new Error('Invalid base32 secret');
    }
    bits += index.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number, digits = 6) {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function generateTotpSecret(length = 20) {
  return base32Encode(randomBytes(length));
}

export function verifyTotpCode(secret: string, code: string, window = 1, stepSeconds = 30) {
  const normalizedCode = code.trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  const currentCounter = Math.floor(Date.now() / 1000 / stepSeconds);
  for (let offset = -window; offset <= window; offset += 1) {
    if (hotp(secret, currentCounter + offset) === normalizedCode) {
      return true;
    }
  }
  return false;
}

export function buildTotpOtpauthUri(input: { email: string; secret: string; issuer?: string }) {
  const issuer = input.issuer ?? env.MFA_ISSUER;
  const label = `${issuer}:${input.email}`;
  const params = new URLSearchParams({
    secret: input.secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}
