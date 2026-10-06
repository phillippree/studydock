import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import DatabaseConstructor, { Database } from 'better-sqlite3';
import { VocabRepository } from '../../src/main/modes/vocab/repository';
import { VocabService } from '../../src/main/modes/vocab/service';
import { GeminiClient } from '../../src/main/gemini/client';
import { SettingsService } from '../../src/main/settings/service';
import { MigrationRunner } from '../../src/main/database/migrations';
import { vocabMigrations } from '../../src/main/modes/vocab/migrations';

describe('Main Process Input Validation', () => {
  let db: Database;
  let repo: VocabRepository;
  let service: VocabService;

  beforeEach(() => {
    db = new DatabaseConstructor(':memory:');
    db.pragma('foreign_keys = ON');

    const runner = new MigrationRunner(db);
    runner.runMigrations(vocabMigrations);

    repo = new VocabRepository(db);
    service = new VocabService(repo, new GeminiClient(), new SettingsService());
  });

  afterEach(() => {
    db.close();
  });

  it('rejects blank words when adding', async () => {
    await expect(service.addWord({ word: '   ' })).rejects.toThrow(/cannot be blank/);
  });

  it('rejects blank words when editing', async () => {
    const word = repo.findWordByNormalized('lucid', 'en')!;
    await expect(service.editWord({ id: word.id, displayWord: '  ' })).rejects.toThrow(/cannot be blank/);
  });

  it('throws helpful error when deleting non-existent word', async () => {
    await expect(service.deleteWord('non_existent_id')).rejects.toThrow(/does not exist/);
  });

  it('throws error when adding definition for non-existent word', async () => {
    await expect(
      service.addDefinition({
        wordId: 'non_existent_id',
        partOfSpeech: 'noun',
        definition: 'test',
        example: 'test'
      })
    ).rejects.toThrow(/not found/);
  });
});
