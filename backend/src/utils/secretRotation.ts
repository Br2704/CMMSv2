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