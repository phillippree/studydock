import { app } from 'electron';
import path from 'path';
import fs from 'fs';

class StoragePaths {
  private customRoot: string | null = null;

  public setCustomRoot(customPath: string | null): void {
    this.customRoot = customPath;
  }

  public getRoot(): string {
    if (this.customRoot) {
      return this.customRoot;
    }
    try {
      if (app && typeof app.getPath === 'function') {
        return app.getPath('userData');
      }
    } catch {
      // Fail closed if Electron storage cannot be resolved.
    }
    throw new Error('Application storage is unavailable. Refusing to save runtime data in the project directory.');
  }

  public getDatabasePath(): string {
    return path.join(this.getRoot(), 'database', 'studydock.sqlite');
  }

  public getSettingsPath(): string {
    return path.join(this.getRoot(), 'settings', 'preferences.json');
  }

  public getSecretsPath(): string {
    return path.join(this.getRoot(), 'secrets', 'gemini-key.enc');
  }

  public getBackupsDir(): string {
    return path.join(this.getRoot(), 'backups');
  }

  public getModeStorageDir(modeId: string): string {
    return path.join(this.getRoot(), 'storage', 'modes', modeId);
  }

  public ensureDirectories(): void {
    const root = this.getRoot();
    const dirs = [
      root,
      path.join(root, 'database'),
      path.join(root, 'settings'),
      path.join(root, 'secrets'),
      path.join(root, 'backups'),
      path.join(root, 'storage'),
      path.join(root, 'storage', 'modes')
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }
}

export const storagePaths = new StoragePaths();
