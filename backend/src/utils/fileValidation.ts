import { env } from '../config/env';

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);
const DOCUMENT_MIME_TYPES = new Set(['application/pdf', ...IMAGE_MIME_TYPES]);

function parseDataUrl(value: string) {
  const match = value.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1].toLowerCase(),
    bytes: Buffer.byteLength(match[2], 'base64'),
  };
}

function isSafeRemoteUrl(value: string) {
  if (value.startsWith('/') && !value.startsWith('//') && !/[\r\n\t]/.test(value)) {
    return true;
  }
  try {
    const parsed = new URL(value);
    if (env.NODE_ENV === 'production') {
      return parsed.protocol === 'https:';
    }
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isSafeImageValue(value: string) {
  if (!value) return false;
  if (value.startsWith('data:')) {
    const parsed = parseDataUrl(value);
    return Boolean(parsed && IMAGE_MIME_TYPES.has(parsed.mimeType) && parsed.bytes <= env.UPLOAD_MAX_IMAGE_BYTES);
  }
  return isSafeRemoteUrl(value);
}

export function isSafeDocumentUpload(input: { name: string; dataUrl: string } | null | undefined) {
  if (!input) return true;
  const trimmedName = input.name.trim();
  if (!trimmedName || trimmedName.length > 255) {
    return false;
  }
  const parsed = parseDataUrl(input.dataUrl);
  return Boolean(parsed && DOCUMENT_MIME_TYPES.has(parsed.mimeType) && parsed.bytes <= env.UPLOAD_MAX_DOCUMENT_BYTES);
}
