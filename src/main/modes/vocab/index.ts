import { ipcMain } from 'electron';
import { Database } from 'better-sqlite3';
import { VocabRepository } from './repository';
import { VocabService } from './service';
import { GeminiClient } from '../../gemini/client';
import { SettingsService } from '../../settings/service';
import { ModeDescriptor } from '../../../shared/contracts/modes';
import { vocabMigrations } from './migrations';
import { VocabPronunciationService } from './pronunciation';
import { VocabVisualService } from './visuals';
import { z } from 'zod';
import { ALLOWED_PARTS_OF_SPEECH } from './schema';

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
  const pronunciationService = new VocabPronunciationService(repository, gemini);
  const visualService = new VocabVisualService(repository, gemini, settings);

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

  ipcMain.handle('vocab:saveDefinitionRetry', async (event, input: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error('Unauthorized save retry request');
    const request = z.object({
      wordId: z.string().min(1),
      senses: z.array(z.object({
        partOfSpeech: z.enum(ALLOWED_PARTS_OF_SPEECH),
        definition: z.string().min(1).max(1000),
        example: z.string().max(1000),
        examples: z.array(z.object({ example: z.string().min(1).max(1000), position: z.number().int().positive(), voice: z.enum(['active', 'passive', 'other']) })).optional(),
        synonyms: z.array(z.string().min(1).max(100)).max(8).optional(),
        source: z.enum(['gemini', 'manual', 'local']).optional()
      })).max(12),
      relatedForms: z.array(z.object({ form: z.string().trim().min(1).max(100), partOfSpeech: z.enum(ALLOWED_PARTS_OF_SPEECH) })).max(8).default([])
    }).parse(input);
    return service.saveDefinitionRetry(request.wordId, request.senses, request.relatedForms);
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

  ipcMain.handle('vocab:previewWord', async (event, input: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error('Unauthorized word preview request');
    const request = z.object({ word: z.string().trim().min(1).max(100), language: z.string().trim().min(2).max(20).optional() }).parse(input);
    return service.previewWord(request);
  });

  ipcMain.handle('vocab:saveWordPreview', async (event, token: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || typeof token !== 'string' || !token || token.length > 100) throw new Error('Invalid word preview save request');
    return service.saveWordPreview(token);
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

  ipcMain.handle('vocab:getPronunciation', async (event, wordId: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame) {
      throw new Error('Unauthorized pronunciation request');
    }
    if (typeof wordId !== 'string' || !wordId.trim() || wordId.length > 128) {
      throw new Error('Invalid word identifier for pronunciation');
    }
    return pronunciationService.getPronunciation(wordId);
  });

  ipcMain.handle('vocab:getVisual', async (event, definitionId: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || typeof definitionId !== 'string' || !definitionId || definitionId.length > 128) throw new Error('Invalid visual request');
    return visualService.getVisual(definitionId);
  });

  ipcMain.handle('vocab:generateVisual', async (event, input: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error('Unauthorized visual request');
    const request = z.object({ definitionId: z.string().min(1).max(128), refresh: z.boolean().optional() }).parse(input);
    return visualService.generateVisual(request.definitionId, request.refresh);
  });

  return {
    service,
    repository,
    migrations: vocabMigrations
  };
}
