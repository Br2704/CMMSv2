import { createHmac, randomBytes } from 'crypto';
import { env } from '../config/env';

interface SecretVersion {
  id: string;
  secret: string;
  createdAt: Date;
  expiresAt?: Date;
  isActive: boolean;
}

interface SecretRotationConfig {
  keyName: string;
  currentVersionId: string;
  versions: SecretVersion[];
  rotationIntervalDays: number;
}

export interface SecretRotationState {
  keys: Record<string, {
    currentVersionId: string;
    versions: SecretVersion[];
    rotationIntervalDays: number;
  }>;
}

class SecretRotationManager {
  private secrets: Map<string, SecretRotationConfig> = new Map();
  private initialized = false;

  initialize() {
    if (this.initialized) return;
    this.initialized = true;
    this.registerSecret('JWT_ACCESS', 90);
    this.registerSecret('JWT_REFRESH', 180);
    this.registerSecret('DATA_ENCRYPTION', 365);
  }

  private registerSecret(keyName: string, rotationIntervalDays: number) {
    const currentVersionId = this.generateVersionId(keyName);
    this.secrets.set(keyName, {
      keyName,
      currentVersionId,
      versions: [
        {
          id: currentVersionId,
          secret: this.getSecretForKey(keyName),
          createdAt: new Date(),
          isActive: true,
        },
      ],
      rotationIntervalDays,
    });
  }

  private generateVersionId(keyName: string): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(8).toString('hex');
    return `${keyName.toUpperCase()}_${timestamp}_${random}`;
  }

  private getSecretForKey(keyName: string): string {
    switch (keyName) {
      case 'JWT_ACCESS':
        return env.JWT_SECRET;
      case 'JWT_REFRESH':
        return env.JWT_REFRESH_SECRET;
      case 'DATA_ENCRYPTION':
        return env.DATA_ENCRYPTION_KEY;
      default:
        throw new Error(`Unknown secret key: ${keyName}`);
    }
  }

  getCurrentSecret(keyName: string): string {
    const config = this.secrets.get(keyName);
    if (!config) {
      throw new Error(`Secret not registered: ${keyName}`);
    }
    const activeVersion = config.versions.find((v) => v.isActive);
    if (!activeVersion) {
      throw new Error(`No active version for secret: ${keyName}`);
    }
    return activeVersion.secret;
  }

  getAllActiveSecrets(keyName: string): string[] {
    const config = this.secrets.get(keyName);
    if (!config) {
      return [this.getSecretForKey(keyName)];
    }
    return config.versions.filter((v) => v.isActive).map((v) => v.secret);
  }

  getAllSecretStatuses(): Array<{
    keyName: string;
    currentVersionId: string;
    versions: SecretVersion[];
    rotationIntervalDays: number;
    lastRotatedAt: Date | null;
    nextRotationAt: Date | null;
  }> {
    const result: Array<{
      keyName: string;
      currentVersionId: string;
      versions: SecretVersion[];
      rotationIntervalDays: number;
      lastRotatedAt: Date | null;
      nextRotationAt: Date | null;
    }> = [];

    for (const [keyName, config] of this.secrets) {
      const latestVersion = config.versions[config.versions.length - 1];
      const lastRotatedAt = config.versions.length > 1 ? latestVersion.createdAt : null;
      const nextRotationAt = new Date(latestVersion.createdAt.getTime() + config.rotationIntervalDays * 24 * 60 * 60 * 1000);
      result.push({
        keyName,
        currentVersionId: config.currentVersionId,
        versions: config.versions.map(v => ({ ...v, secret: v.secret.substring(0, 8) + '...' })), // mask secrets
        rotationIntervalDays: config.rotationIntervalDays,
        lastRotatedAt,
        nextRotationAt,
      });
    }
    return result;
  }

  exportState(): SecretRotationState {
    const keys: SecretRotationState['keys'] = {};
    for (const [keyName, config] of this.secrets) {
      keys[keyName] = {
        currentVersionId: config.currentVersionId,
        versions: config.versions.map(v => ({
          id: v.id,
          secret: v.secret,
          createdAt: v.createdAt,
          expiresAt: v.expiresAt,
          isActive: v.isActive,
        })),
        rotationIntervalDays: config.rotationIntervalDays,
      };
    }
    return { keys };
  }

  importState(state: SecretRotationState): void {
    if (!state?.keys) return;
    for (const [keyName, keyState] of Object.entries(state.keys)) {
      if (keyState.versions.length === 0) continue;
      this.secrets.set(keyName, {
        keyName,
        currentVersionId: keyState.currentVersionId,
        versions: keyState.versions,
        rotationIntervalDays: keyState.rotationIntervalDays,
      });
    }
  }

  isKeyGracePeriodExpired(keyName: string): boolean {
    const config = this.secrets.get(keyName);
    if (!config) return true;

    const latestVersion = config.versions[config.versions.length - 1];
    const gracePeriodMs = config.rotationIntervalDays * 24 * 60 * 60 * 1000;
    return Date.now() - latestVersion.createdAt.getTime() > gracePeriodMs;
  }

  rotateSecret(keyName: string): void {
    const config = this.secrets.get(keyName);
    if (!config) {
      throw new Error(`Secret not registered: ${keyName}`);
    }

    config.versions.forEach((v) => (v.isActive = false));

    const newVersionId = this.generateVersionId(keyName);
    const newSecret = this.generateNewSecret(keyName);

    config.versions.push({
      id: newVersionId,
      secret: newSecret,
      createdAt: new Date(),
      isActive: true,
    });
    config.currentVersionId = newVersionId;
  }

  private generateNewSecret(keyName: string): string {
    const oldSecret = this.getSecretForKey(keyName);
    const rotationSalt = randomBytes(16).toString('hex');
    return createHmac('sha256', rotationSalt).update(oldSecret).digest('hex');
  }

  verifySecret(keyName: string, secret: string, allowMultipleVersions = false): boolean {
    const config = this.secrets.get(keyName);
    if (!config) {
      return secret === this.getSecretForKey(keyName);
    }

    const activeVersions = config.versions.filter((v) => v.isActive);
    const isValid = activeVersions.some((v) => v.secret === secret);

    if (isValid && allowMultipleVersions && activeVersions.length > 1) {
      return true;
    }

    return isValid;
  }
}

export const secretRotationManager = new SecretRotationManager();

export function initializeSecretRotation() {
  secretRotationManager.initialize();
}