import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DatabaseConstructor, { Database } from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({
  app: {},
  nativeImage: { createFromBuffer: () => ({ toJPEG: () => Buffer.from('fake-jpeg'), isEmpty: () => false, getSize: () => ({ width: 1200, height: 800 }) }) }
}));

import { MigrationRunner } from '../../src/main/database/migrations';
import { vocabMigrations } from '../../src/main/modes/vocab/migrations';
import { VocabRepository } from '../../src/main/modes/vocab/repository';
import { VocabVisualService } from '../../src/main/modes/vocab/visuals';
import { GeminiClient } from '../../src/main/gemini/client';
import { SettingsService } from '../../src/main/settings/service';
import { storagePaths } from '../../src/main/storage/paths';

describe('Vocabulary visuals', () => {
  let db: Database;
  let root: string;
  let repo: VocabRepository;
  let gemini: GeminiClient;
  let service: VocabVisualService;
  let definitionId: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'studydock-visual-test-'));
    storagePaths.setCustomRoot(root);
    db = new DatabaseConstructor(':memory:');
    db.pragma('foreign_keys = ON');
    new MigrationRunner(db).runMigrations(vocabMigrations);
    repo = new VocabRepository(db);
    gemini = new GeminiClient();
    const settings = new SettingsService();
    vi.spyOn(settings, 'getModel').mockReturnValue('text-test-model');
    vi.spyOn(gemini, 'getApiKey').mockReturnValue('FAKE-key');
    vi.spyOn(gemini, 'generateStructured').mockResolvedValue({
      caption: 'Maya practices again after her injury.',
      imagePrompt: 'A person returning to a familiar sports field after recovering from an injury.'
    });
    vi.spyOn(gemini, 'generateVocabImage').mockResolvedValue(Buffer.from('fake-image'));
    service = new VocabVisualService(repo, gemini, settings);
    const word = repo.getAllWordsWithDefinitions()[0];
    definitionId = word.definitions[0].id;
  });

  afterEach(() => {
    db.close();
    storagePaths.setCustomRoot(null);
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('generates once, stores a local image and caption, then serves the cached visual', async () => {
    const first = await service.generateVisual(definitionId);
    expect(first.caption).toBe('Maya practices again after her injury.');
    expect(first.dataUrl).toBe(`data:image/jpeg;base64,${Buffer.from('fake-jpeg').toString('base64')}`);
    expect(fs.readdirSync(storagePaths.getVocabImagesDir())).toHaveLength(1);
    const second = await service.generateVisual(definitionId);
    expect(second).toEqual(first);
    expect(gemini.generateVocabImage).toHaveBeenCalledTimes(1);
  });

  it('replaces the image on explicit regeneration and rejects removed meanings', async () => {
    await service.generateVisual(definitionId);
    await service.generateVisual(definitionId, true);
    expect(gemini.generateVocabImage).toHaveBeenCalledTimes(2);
    expect(fs.readdirSync(storagePaths.getVocabImagesDir())).toHaveLength(1);
    repo.deleteDefinition(definitionId);
    expect(await service.getVisual(definitionId)).toBeNull();
    await expect(service.generateVisual(definitionId)).rejects.toThrow('no longer in your Word Library');
  });

  it('uploads an image locally, replaces an existing visual, and removes it without Gemini', async () => {
    await service.generateVisual(definitionId);
    vi.mocked(gemini.generateVocabImage).mockClear();
    const uploaded = await service.uploadVisual(definitionId, `data:image/png;base64,${Buffer.from('fake-upload').toString('base64')}`, 'A helpful scene');
    expect(uploaded.caption).toBe('A helpful scene');
    expect(repo.getVisualRecord(definitionId)?.imageFile).toMatch(/^[a-f0-9-]+\.jpg$/);
    expect(fs.readdirSync(storagePaths.getVocabImagesDir())).toHaveLength(1);
    expect(gemini.generateVocabImage).not.toHaveBeenCalled();
    await service.deleteVisual(definitionId);
    expect(await service.getVisual(definitionId)).toBeNull();
    expect(fs.readdirSync(storagePaths.getVocabImagesDir())).toHaveLength(0);
  });

  it('rejects invalid uploads without replacing a saved visual', async () => {
    const existing = await service.generateVisual(definitionId);
    await expect(service.uploadVisual(definitionId, 'data:text/html;base64,PGgxPkJhZDwvaDE+', 'Bad')).rejects.toThrow('JPEG, PNG, or WebP');
    await expect(service.uploadVisual(definitionId, 'data:image/png;base64,not valid', 'Bad')).rejects.toThrow('JPEG, PNG, or WebP');
    expect(await service.getVisual(definitionId)).toEqual(existing);
    expect(fs.readdirSync(storagePaths.getVocabImagesDir())).toHaveLength(1);
  });
});
