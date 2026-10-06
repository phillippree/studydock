import { safeStorage } from 'electron';
import fs from 'fs';
import { storagePaths } from '../storage/paths';

export class SecretsService {
  private sessionKey: string | null = null;
  private isSessionKeyOnly = false;

  public isEncryptionAvailable(): boolean {
    try {
      return typeof safeStorage !== 'undefined' && safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  public saveKey(apiKey: string, sessionOnly = false): { success: boolean; error?: string } {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      return { success: false, error: 'API key cannot be empty' };
    }

    if (sessionOnly || !this.isEncryptionAvailable()) {
      this.sessionKey = trimmed;
      this.isSessionKeyOnly = true;
      // If we previously saved a persistent key, remove it if switching to session only
      this.removePersistedKeyFile();
      return { success: true };
    }

    try {
      const encryptedBuffer = safeStorage.encryptString(trimmed);
      const secretPath = storagePaths.getSecretsPath();
      fs.writeFileSync(secretPath, encryptedBuffer);
      this.sessionKey = trimmed;
      this.isSessionKeyOnly = false;
      return { success: true };
    } catch (err: unknown) {
      // Fall back to session key if OS encryption failed
      this.sessionKey = trimmed;
      this.isSessionKeyOnly = true;
      const msg = err instanceof Error ? err.message : 'Unknown encryption error';
      return { success: false, error: `Secure storage failed: ${msg}. Stored for this session only.` };
    }
  }

  public getKey(): string | null {
    if (this.sessionKey) {
      return this.sessionKey;
    }

    const secretPath = storagePaths.getSecretsPath();
    if (!fs.existsSync(secretPath)) {
      return null;
    }

    if (!this.isEncryptionAvailable()) {
      return null;
    }

    try {
      const encryptedBuffer = fs.readFileSync(secretPath);
      const decrypted = safeStorage.decryptString(encryptedBuffer);
      this.sessionKey = decrypted;
      this.isSessionKeyOnly = false;
      return decrypted;
    } catch {
      return null;
    }
  }

  public removeKey(): void {
    this.sessionKey = null;
    this.isSessionKeyOnly = false;
    this.removePersistedKeyFile();
  }

  private removePersistedKeyFile(): void {
    try {
      const secretPath = storagePaths.getSecretsPath();
      if (fs.existsSync(secretPath)) {
        fs.unlinkSync(secretPath);
      }
    } catch {
      // Ignore deletion errors
    }
  }

  public getMaskedKey(): string | null {
    const key = this.getKey();
    if (!key) return null;
    if (key.length <= 8) {
      return '••••••••';
    }
    const prefix = key.slice(0, 4);
    const suffix = key.slice(-4);
    return `${prefix}••••••••${suffix}`;
  }

  public hasKey(): boolean {
    return this.getKey() !== null;
  }

  public isSessionOnly(): boolean {
    return this.isSessionKeyOnly;
  }
}

export const secretsService = new SecretsService();
