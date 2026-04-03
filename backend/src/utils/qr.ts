import { randomBytes } from 'crypto';

export function generateQrToken() {
  return randomBytes(24).toString('base64url');
}

export function generateQrCodeId() {
  return randomBytes(12).toString('hex').toUpperCase();
}

export function buildQrPayload(token: string) {
  return JSON.stringify({
    v: 1,
    token,
  });
}
