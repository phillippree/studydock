import { ipcMain } from 'electron';
import Database from 'better-sqlite3';
import { IDIOMS_PHRASES_MODE } from '../../../shared/contracts/modes';
import { ExpressionType } from '../../../shared/contracts/idiomsPhrases';
import { GeminiClient } from '../../gemini/client';
import { SettingsService } from '../../settings/service';
import { IdiomsPhrasesRepository } from './repository';
import { IdiomsPhrasesService } from './service';
import { idiomsPhrasesExampleVoiceMigration, idiomsPhrasesMigration } from './migration';

export const idiomsPhrasesModeDescriptor = IDIOMS_PHRASES_MODE;

export function registerIdiomsPhrasesMode(db: Database.Database, gemini: GeminiClient, settings: SettingsService) {
  const repository = new IdiomsPhrasesRepository(db);
  const service = new IdiomsPhrasesService(repository, gemini, settings);
  ipcMain.handle('idiomsPhrases:list', (event, input: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) {
      throw new Error('Invalid Idioms & Phrases list request');
    }
    const query = (input || {}) as { type?: unknown; search?: unknown; offset?: unknown; limit?: unknown };
    if (typeof query.type !== 'undefined' && query.type !== 'idiom' && query.type !== 'phrase' ||
        typeof query.search !== 'undefined' && typeof query.search !== 'string' ||
        typeof query.offset !== 'undefined' && (!Number.isInteger(query.offset) || (query.offset as number) < 0) ||
        typeof query.limit !== 'undefined' && (!Number.isInteger(query.limit) || (query.limit as number) < 1 || (query.limit as number) > 50)) {
      throw new Error('Invalid Idioms & Phrases list request');
    }
    return service.list(query as { type?: ExpressionType; search?: string; offset?: number; limit?: number });
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
  ipcMain.handle('idiomsPhrases:refreshExamples', (event, id: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || typeof id !== 'string' || !id || id.length > 200) {
      throw new Error('Invalid Idioms & Phrases example refresh request');
    }
    return service.refreshExamples(id);
  });
  ipcMain.handle('idiomsPhrases:quizGetRandom', (event, input: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || !input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Invalid Idioms & Phrases quiz request');
    }
    const request = input as { type?: unknown; excludeId?: unknown };
    if (typeof request.type !== 'undefined' && request.type !== 'idiom' && request.type !== 'phrase' ||
        typeof request.excludeId !== 'undefined' && (typeof request.excludeId !== 'string' || request.excludeId.length > 200)) {
      throw new Error('Invalid Idioms & Phrases quiz request');
    }
    return service.getRandomQuizPrompt(request.type as ExpressionType | undefined, request.excludeId as string | undefined);
  });
  ipcMain.handle('idiomsPhrases:quizReveal', (event, id: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || typeof id !== 'string' || !id || id.length > 200) {
      throw new Error('Invalid Idioms & Phrases quiz entry ID');
    }
    return service.revealQuizEntry(id);
  });
  return { service, repository, migrations: [idiomsPhrasesMigration, idiomsPhrasesExampleVoiceMigration] };
}
