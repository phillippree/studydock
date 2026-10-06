import fs from 'fs';
import { shell } from 'electron';
import { storagePaths } from '../storage/paths';
import { secretsService } from './secrets';
import { GeminiSettings, SaveKeyInput } from '../../shared/contracts/settings';

interface UserPreferences {
  model: string;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  model: 'gemini-2.5-flash'
};

export class SettingsService {
  private loadPreferences(): UserPreferences {
    try {
      const filePath = storagePaths.getSettingsPath();
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_PREFERENCES,
          ...parsed
        };
      }
    } catch {
      // Fallback on error
    }
    return { ...DEFAULT_PREFERENCES };
  }

  private savePreferences(prefs: UserPreferences): void {
    try {
      const filePath = storagePaths.getSettingsPath();
      fs.writeFileSync(filePath, JSON.stringify(prefs, null, 2), 'utf-8');
    } catch {
      // Fallback on error
    }
  }

  public getSettings(): GeminiSettings {
    const prefs = this.loadPreferences();
    return {
      hasKey: secretsService.hasKey(),
      apiKeyMasked: secretsService.getMaskedKey(),
      isSessionOnly: secretsService.isSessionOnly(),
      isEncryptionAvailable: secretsService.isEncryptionAvailable(),
      model: prefs.model,
      storageLocation: storagePaths.getRoot(),
      databasePath: storagePaths.getDatabasePath()
    };
  }

  public saveApiKey(input: SaveKeyInput): { success: boolean; error?: string } {
    return secretsService.saveKey(input.apiKey, input.sessionOnly);
  }

  public removeApiKey(): { success: boolean } {
    secretsService.removeKey();
    return { success: true };
  }

  public getModel(): string {
    return this.loadPreferences().model;
  }

  public setModel(model: string): { success: boolean } {
    const prefs = this.loadPreferences();
    prefs.model = model;
    this.savePreferences(prefs);
    return { success: true };
  }

  public async openStorageFolder(): Promise<{ success: boolean }> {
    const root = storagePaths.getRoot();
    storagePaths.ensureDirectories();
    const result = await shell.openPath(root);
    return { success: result === '' };
  }
}

export const settingsService = new SettingsService();
