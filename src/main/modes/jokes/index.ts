import { ipcMain } from 'electron';
import Database from 'better-sqlite3';
import { JokeType } from '../../../shared/contracts/jokes';
import { JOKES_MODE } from '../../../shared/contracts/modes';
import { GeminiClient } from '../../gemini/client';
import { SettingsService } from '../../settings/service';
import { jokesExamplesMigration, jokesMigration } from './migration';
import { JokesRepository } from './repository';
import { JokesService } from './service';

export const jokesModeDescriptor = JOKES_MODE;

export function registerJokesMode(db: Database.Database, gemini: GeminiClient, settings: SettingsService) {
  const repository = new JokesRepository(db);
  const service = new JokesService(repository, gemini, settings);

  ipcMain.handle('jokes:list', (event, input: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) throw new Error('Invalid Punchlines & Jokes list request');
    const query = (input || {}) as { type?: unknown; search?: unknown; offset?: unknown; limit?: unknown };
    if (query.type !== undefined && query.type !== 'joke' && query.type !== 'punchline' ||
        query.search !== undefined && typeof query.search !== 'string' ||
        query.offset !== undefined && (!Number.isInteger(query.offset) || (query.offset as number) < 0) ||
        query.limit !== undefined && (!Number.isInteger(query.limit) || (query.limit as number) < 1 || (query.limit as number) > 50)) throw new Error('Invalid Punchlines & Jokes list request');
    return service.list(query as Parameters<typeof service.list>[0]);
  });

  ipcMain.handle('jokes:lookup', (event, input: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || !input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid joke lookup request');
    const request = input as { text?: unknown; type?: unknown; language?: unknown };
    if (typeof request.text !== 'string' || request.type !== 'joke' && request.type !== 'punchline' || request.language !== undefined && typeof request.language !== 'string') throw new Error('Invalid joke lookup request');
    return service.lookup(request.text, request.type as JokeType, request.language);
  });

  ipcMain.handle('jokes:savePreview', (event, token: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || typeof token !== 'string' || !token || token.length > 100) throw new Error('Invalid joke preview save request');
    return service.savePreview(token);
  });

  ipcMain.handle('jokes:getById', (event, id: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || typeof id !== 'string' || !id || id.length > 200) throw new Error('Invalid joke details request');
    return service.getById(id);
  });

  return { service, repository, migrations: [jokesMigration, jokesExamplesMigration] };
}
