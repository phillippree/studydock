import { ipcMain } from 'electron';
import Database from 'better-sqlite3';
import { CONNECTOR_CATEGORIES } from '../../../shared/contracts/connectors';
import { CONNECTORS_MODE } from '../../../shared/contracts/modes';
import { GeminiClient } from '../../gemini/client';
import { SettingsService } from '../../settings/service';
import { connectorsMigration } from './migration';
import { ConnectorsRepository } from './repository';
import { ConnectorsService } from './service';

export const connectorsModeDescriptor = CONNECTORS_MODE;

export function registerConnectorsMode(db: Database.Database, gemini: GeminiClient, settings: SettingsService) {
  const repository = new ConnectorsRepository(db);
  const service = new ConnectorsService(repository, gemini, settings);

  ipcMain.handle('connectors:list', (event, input: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) throw new Error('Invalid Connectors list request');
    const query = (input || {}) as { category?: unknown; search?: unknown; offset?: unknown; limit?: unknown };
    if (query.category !== undefined && !(CONNECTOR_CATEGORIES as readonly unknown[]).includes(query.category) ||
        query.search !== undefined && typeof query.search !== 'string' ||
        query.offset !== undefined && (!Number.isInteger(query.offset) || (query.offset as number) < 0) ||
        query.limit !== undefined && (!Number.isInteger(query.limit) || (query.limit as number) < 1 || (query.limit as number) > 50)) throw new Error('Invalid Connectors list request');
    return service.list(query as Parameters<typeof service.list>[0]);
  });

  ipcMain.handle('connectors:lookup', (event, input: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || !input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid Connectors lookup request');
    const request = input as { connector?: unknown; language?: unknown };
    if (typeof request.connector !== 'string' || request.language !== undefined && typeof request.language !== 'string') throw new Error('Invalid Connectors lookup request');
    return service.lookup(request.connector, request.language);
  });

  ipcMain.handle('connectors:savePreview', (event, token: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || typeof token !== 'string' || !token || token.length > 100) throw new Error('Invalid Connectors preview save request');
    return service.savePreview(token);
  });

  ipcMain.handle('connectors:refreshExamples', (event, id: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || typeof id !== 'string' || !id || id.length > 200) throw new Error('Invalid Connectors example refresh request');
    return service.refreshExamples(id);
  });

  return { service, repository, migrations: [connectorsMigration] };
}
