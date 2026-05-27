import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { env } from '../../config/env';

// Securely derive a 32-byte key from the environment secret
// In a real production system, this could also be a KMS-managed key
const ALGORITHM = 'aes-256-gcm';
const getEncryptionKey = (): Buffer => {
  const secret = env.JWT_SECRET || 'cmms-fallback-secret-key-32chars!';
  return scryptSync(secret, 'salt', 32);
};

export interface EncryptedStreamResult {
  cipher: ReturnType<typeof createCipheriv>;
  iv: string;
}

/**
 * Creates an AES-256-GCM cipher stream for encrypting backup files.
 * @returns {EncryptedStreamResult} The cipher stream and the randomly generated IV (hex encoded)
 */
export function createBackupCipher(): EncryptedStreamResult {
  const iv = randomBytes(16);
  const key = getEncryptionKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  return {
    cipher,
    iv: iv.toString('hex'),
  };
}

/**
 * Creates an AES-256-GCM decipher stream for decrypting backup files.
 * @param ivHex The Initialization Vector (in hex) generated during encryption.
 * @param authTagHex The Auth Tag (in hex) generated during encryption.
 * @returns The decipher stream.
 */
export function createBackupDecipher(ivHex: string, authTagHex: string): ReturnType<typeof createDecipheriv> {
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getEncryptionKey();
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  return decipher;
}
