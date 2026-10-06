import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DatabaseConstructor, { Database } from 'better-sqlite3';
import { MigrationRunner } from '../../src/main/database/migrations';
import { idiomsPhrasesMigration } from '../../src/main/modes/idioms-phrases/migration';
import { IdiomsPhrasesRepository } from '../../src/main/modes/idioms-phrases/repository';
import { IdiomsPhrasesService } from '../../src/main/modes/idioms-phrases/service';
import { GeminiClient } from '../../src/main/gemini/client';
import { SettingsService } from '../../src/main/settings/service';
import { validateExpressionLookup } from '../../src/main/modes/idioms-phrases/schema';

describe('Idioms & Phrases mode', () => {
  let db: Database;
  let repository: IdiomsPhrasesRepository;
  let gemini: GeminiClient;
  let service: IdiomsPhrasesService;

  beforeEach(() => {
    db = new DatabaseConstructor(':memory:');
    db.pragma('foreign_keys = ON');
    new MigrationRunner(db).runMigrations([idiomsPhrasesMigration]);
    repository = new IdiomsPhrasesRepository(db);
    gemini = new GeminiClient();
    const settings = new SettingsService();
    vi.spyOn(gemini, 'getApiKey').mockReturnValue('fake-test-key');
    vi.spyOn(settings, 'getModel').mockReturnValue('gemini-test-model');
    service = new IdiomsPhrasesService(repository, gemini, settings);
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  it('verifies, saves, and reloads an idiom with examples', async () => {
    vi.spyOn(gemini, 'generateStructured').mockResolvedValueOnce({
      expression: 'break the ice',
      type: 'idiom',
      language: 'en',
      recognized: true,
      meaning: 'To make people feel more relaxed in a social setting.',
      examples: ['Maya told a joke to break the ice at the meeting.', 'A short game helped break the ice.']
    });

    const result = await service.lookupAndSave(' break   the ice ', 'idiom');
    expect(result.status).toBe('saved');
    if (result.status !== 'saved') throw new Error('Expected saved result');
    expect(result.entry.examples).toHaveLength(2);
    expect(repository.find('break the ice', 'idiom', 'en')?.meaning).toContain('relaxed');
    expect(repository.list()).toHaveLength(1);
  });

  it('accepts Gemini null suggestion when a recognized phrase has no correction', () => {
    expect(validateExpressionLookup({
      expression: 'speak of the devil', type: 'phrase', language: 'en', recognized: true,
      meaning: 'Someone being discussed appears unexpectedly.',
      examples: ['We mentioned Alex, and speak of the devil, he walked in.'],
      suggestion: null
    }, 'speak of the devil', 'en', 'phrase')).toMatchObject({
      recognized: true,
      meaning: 'Someone being discussed appears unexpectedly.',
      examples: ['We mentioned Alex, and speak of the devil, he walked in.']
    });
  });

  it('does not save unrecognized expressions', async () => {
    vi.spyOn(gemini, 'generateStructured').mockResolvedValueOnce({
      expression: 'blorp the moon', type: 'idiom', language: 'en', recognized: false, examples: [], suggestion: 'reach for the moon'
    });
    await expect(service.lookupAndSave('blorp the moon', 'idiom')).resolves.toMatchObject({ status: 'unrecognized', suggestion: 'reach for the moon' });
    expect(repository.list()).toEqual([]);
  });

  it('returns the saved record for duplicates without another Gemini request', async () => {
    const existing = repository.save({
      expression: 'on the same page', normalizedExpression: 'on the same page', type: 'phrase', language: 'en',
      meaning: 'To share an understanding.', examples: ['The team is on the same page.']
    });
    const generate = vi.spyOn(gemini, 'generateStructured');
    await expect(service.lookupAndSave(' ON THE SAME PAGE ', 'phrase')).resolves.toMatchObject({ status: 'duplicate', entry: { id: existing.id } });
    expect(generate).not.toHaveBeenCalled();
  });

  it('does not save an unrecognized result', async () => {
    vi.spyOn(gemini, 'generateStructured').mockResolvedValueOnce({
      expression: 'spill the beans', type: 'idiom', language: 'en', recognized: false, examples: []
    });
    await expect(service.lookupAndSave('spill the beans', 'idiom')).resolves.toMatchObject({ status: 'unrecognized' });
    expect(repository.list()).toEqual([]);
  });

  it('rejects a response classified under a different requested type', () => {
    expect(validateExpressionLookup({
      expression: 'spill the beans', type: 'phrase', language: 'en', recognized: true,
      meaning: 'To reveal a secret.', examples: ['He spilled the beans.']
    }, 'spill the beans', 'en', 'idiom')).toMatchObject({ recognized: false });
  });
});
