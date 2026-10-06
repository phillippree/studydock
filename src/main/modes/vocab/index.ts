import { ipcMain } from 'electron';
import { Database } from 'better-sqlite3';
import { VocabRepository } from './repository';
import { VocabService } from './service';
import { GeminiClient } from '../../gemini/client';
import { SettingsService } from '../../settings/service';
import { ModeDescriptor } from '../../../shared/contracts/modes';
import { vocabMigrations } from './migrations';

export const vocabModeDescriptor: ModeDescriptor = {
  id: 'vocab',
  displayName: 'Vocabulary',
  description: 'Explore words and build your local word library.',
  iconName: 'BookOpen',
  order: 1
};

export function registerVocabMode(
  db: Database,
  gemini: GeminiClient,
  settings: SettingsService
): { service: VocabService; repository: VocabRepository; migrations: typeof vocabMigrations } {
  const repository = new VocabRepository(db);
  const service = new VocabService(repository, gemini, settings);

  // Register validated IPC handlers for vocabulary operations
  ipcMain.handle('vocab:getRandomWord', async (_event, options) => {
    return service.getRandomWord(options);
  });

  ipcMain.handle('vocab:fetchDefinition', async (_event, { wordId, forceRefresh }) => {
    if (typeof wordId !== 'string' || !wordId) {
      throw new Error('Invalid wordId');
    }
    return service.fetchDefinition(wordId, Boolean(forceRefresh));
  });

  ipcMain.handle('vocab:saveDefinitionRetry', async (_event, { wordId, senses }) => {
    if (typeof wordId !== 'string' || !wordId || !Array.isArray(senses)) {
      throw new Error('Invalid parameters for save retry');
    }
    return service.saveDefinitionRetry(wordId, senses);
  });

  ipcMain.handle('vocab:getAllWords', async () => {
    return service.getAllWords();
  });

  ipcMain.handle('vocab:getWordDetails', async (_event, wordId) => {
    if (typeof wordId !== 'string' || !wordId) {
      throw new Error('Invalid wordId');
    }
    return service.getWordDetails(wordId);
  });

  ipcMain.handle('vocab:addWord', async (_event, input) => {
    if (!input || typeof input.word !== 'string') {
      throw new Error('Invalid word input');
    }
    return service.addWord(input);
  });

  ipcMain.handle('vocab:verifyAndAddWord', async (event, input: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame) {
      throw new Error('Unauthorized word verification request');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Invalid word verification input');
    }
    const request = input as { word?: unknown; language?: unknown };
    if (typeof request.word !== 'string' || (typeof request.language !== 'undefined' && typeof request.language !== 'string')) {
      throw new Error('Invalid word verification input');
    }
    return service.verifyAndAddWord({ word: request.word, language: request.language });
  });

  ipcMain.handle('vocab:editWord', async (_event, input) => {
    if (!input || typeof input.id !== 'string' || typeof input.displayWord !== 'string') {
      throw new Error('Invalid edit word input');
    }
    return service.editWord(input);
  });

  ipcMain.handle('vocab:deleteWord', async (_event, wordId) => {
    if (typeof wordId !== 'string' || !wordId) {
      throw new Error('Invalid wordId');
    }
    return service.deleteWord(wordId);
  });

  ipcMain.handle('vocab:addDefinition', async (_event, input) => {
    if (!input || typeof input.wordId !== 'string' || !input.definition) {
      throw new Error('Invalid definition input');
    }
    return service.addDefinition(input);
  });

  ipcMain.handle('vocab:editDefinition', async (_event, input) => {
    if (!input || typeof input.id !== 'string' || !input.definition) {
      throw new Error('Invalid edit definition input');
    }
    return service.editDefinition(input);
  });

  ipcMain.handle('vocab:deleteDefinition', async (_event, definitionId) => {
    if (typeof definitionId !== 'string' || !definitionId) {
      throw new Error('Invalid definitionId');
    }
    return service.deleteDefinition(definitionId);
  });

  ipcMain.handle('vocab:importWords', async (_event, { content, language }) => {
    if (typeof content !== 'string') {
      throw new Error('Invalid content for import');
    }
    return service.importWords(content, language);
  });

  ipcMain.handle('vocab:exportData', async () => {
    return service.exportData();
  });

  return {
    service,
    repository,
    migrations: vocabMigrations
  };
}
