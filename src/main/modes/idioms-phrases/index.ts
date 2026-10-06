import { ipcMain } from 'electron';
import Database from 'better-sqlite3';
import { IDIOMS_PHRASES_MODE } from '../../../shared/contracts/modes';
import { ExpressionType } from '../../../shared/contracts/idiomsPhrases';
import { GeminiClient } from '../../gemini/client';
import { SettingsService } from '../../settings/service';
import { IdiomsPhrasesRepository } from './repository';
import { IdiomsPhrasesService } from './service';
import { idiomsPhrasesMigration } from './migration';

export const idiomsPhrasesModeDescriptor = IDIOMS_PHRASES_MODE;

export function registerIdiomsPhrasesMode(db: Database.Database, gemini: GeminiClient, settings: SettingsService) {
  const repository = new IdiomsPhrasesRepository(db);
  const service = new IdiomsPhrasesService(repository, gemini, settings);
  ipcMain.handle('idiomsPhrases:list', (event, type: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || typeof type !== 'undefined' && type !== 'idiom' && type !== 'phrase') {
      throw new Error('Invalid Idioms & Phrases list request');
    }
    return service.list(type as ExpressionType | undefined);
  });
  ipcMain.handle('idiomsPhrases:lookupAndSave', (event, input: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || !input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Invalid Idioms & Phrases lookup request');
    }
    const request = input as { expression?: unknown; type?: unknown; language?: unknown };
    if (typeof request.expression !== 'string' || (request.type !== 'idiom' && request.type !== 'phrase') || typeof request.language !== 'undefined' && typeof request.language !== 'string') {
      throw new Error('Invalid Idioms & Phrases lookup request');
    }
    return service.lookupAndSave(request.expression, request.type, request.language);
  });
  return { service, repository, migrations: [idiomsPhrasesMigration] };
}
