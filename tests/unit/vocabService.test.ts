import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import DatabaseConstructor, { Database } from 'better-sqlite3';
import { VocabRepository } from '../../src/main/modes/vocab/repository';
import { VocabService } from '../../src/main/modes/vocab/service';
import { GeminiClient } from '../../src/main/gemini/client';
import { SettingsService } from '../../src/main/settings/service';
import { MigrationRunner } from '../../src/main/database/migrations';
import { vocabMigrations } from '../../src/main/modes/vocab/migrations';

describe('Vocabulary Service Logic and Resilience', () => {
  let db: Database;
  let repo: VocabRepository;
  let mockGemini: GeminiClient;
  let mockSettings: SettingsService;
  let service: VocabService;

  beforeEach(() => {
    db = new DatabaseConstructor(':memory:');
    db.pragma('foreign_keys = ON');

    const runner = new MigrationRunner(db);
    runner.runMigrations(vocabMigrations);

    repo = new VocabRepository(db);
    mockGemini = new GeminiClient();
    mockSettings = new SettingsService();

    // Mock settings
    vi.spyOn(mockSettings, 'getModel').mockReturnValue('gemini-2.5-flash');
    vi.spyOn(mockGemini, 'getApiKey').mockReturnValue('mock-api-key');

    service = new VocabService(repo, mockGemini, mockSettings);
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  it('serves cached definitions offline without calling Gemini API', async () => {
    const generateSpy = vi.spyOn(mockGemini, 'generateStructured');

    // Get random word which is seeded with definitions
    const result = await service.getRandomWord();
    expect(result).not.toBeNull();
    expect(result!.status).toBe('saved_locally');
    expect(result!.definitions.length).toBeGreaterThan(0);
    // API should NOT be called because definitions exist locally
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it('generates, validates, and transactionally saves definitions for new word', async () => {
    const newWord = await service.addWord({ word: 'ineffable' });
    expect(newWord.isDuplicate).toBe(false);

    vi.spyOn(mockGemini, 'generateStructured').mockResolvedValueOnce({
      word: 'ineffable',
      language: 'en',
      recognized: true,
      senses: [
        {
          partOfSpeech: 'adjective',
          definition: 'Too great or extreme to be expressed in words.',
          synonyms: ['indescribable', 'inexpressible'],
          examples: Array.from({ length: 6 }, (_, index) => ({
            example: `The view from the mountain peak was of ineffable beauty, example ${index + 1}.`,
            voice: index === 1 ? 'passive' : 'active'
          }))
        }
      ]
    });

    const result = await service.fetchDefinition(newWord.word.id, false);
    expect(result.status).toBe('generated_gemini');
    expect(result.definitions).toHaveLength(1);
    expect(result.definitions[0].definition).toContain('Too great');

    // Confirm it is now saved locally in DB
    const inDb = repo.getDefinitionsForWord(newWord.word.id);
    expect(inDb).toHaveLength(1);
    expect(inDb[0].source).toBe('gemini');
    expect(inDb[0].examples).toHaveLength(6);
    expect(inDb[0].examples[1].voice).toBe('passive');
    expect(inDb[0].synonyms).toEqual(['indescribable', 'inexpressible']);
  });

  it('preserves existing definitions when a refresh request fails', async () => {
    const word = repo.findWordByNormalized('lucid', 'en')!;
    const originalDefs = repo.getDefinitionsForWord(word.id);
    expect(originalDefs.length).toBeGreaterThan(0);

    // Mock Gemini API error
    vi.spyOn(mockGemini, 'generateStructured').mockRejectedValueOnce(
      new Error('Gemini API 503 service unavailable')
    );

    const result = await service.fetchDefinition(word.id, true);
    // Should still return existing definitions and indicate error
    expect(result.definitions.length).toBe(originalDefs.length);
    expect(result.status).toBe('saved_locally');
    expect(result.generationError).toContain('Gemini API 503');

    // DB records should be completely untouched
    const afterDefs = repo.getDefinitionsForWord(word.id);
    expect(afterDefs.length).toBe(originalDefs.length);
  });

  it('handles unrecognized words without saving fake definitions', async () => {
    const bogusWord = await service.addWord({ word: 'xyzqwerty987' });

    vi.spyOn(mockGemini, 'generateStructured').mockResolvedValueOnce({
      word: 'xyzqwerty987',
      language: 'en',
      recognized: false,
      senses: []
    });

    const result = await service.fetchDefinition(bogusWord.word.id, false);
    expect(result.status).toBe('unrecognized');
    expect(result.definitions).toHaveLength(0);

    // Verify DB has 0 definitions
    const dbDefs = repo.getDefinitionsForWord(bogusWord.word.id);
    expect(dbDefs).toHaveLength(0);
  });

  it('discards late responses if the word was deleted while request was in-flight', async () => {
    const tempWord = await service.addWord({ word: 'temporary' });

    vi.spyOn(mockGemini, 'generateStructured').mockImplementationOnce(async () => {
      // Delete word while in flight
      repo.deleteWord(tempWord.word.id);
      return {
        word: 'temporary',
        language: 'en',
        recognized: true,
        senses: [
          {
            partOfSpeech: 'adjective',
            definition: 'Lasting for only a limited period of time.',
            examples: Array.from({ length: 6 }, (_, index) => ({
              example: `This is a temporary measure, example ${index + 1}.`,
              voice: 'active'
            }))
          }
        ]
      };
    });

    const result = await service.fetchDefinition(tempWord.word.id, false);
    expect(result.status).toBe('error');
    expect(result.generationError).toContain('modified or deleted');

    // Verify word was not accidentally recreated in DB
    expect(repo.findWordById(tempWord.word.id)).toBeNull();
  });

  it('deduplicates word additions', async () => {
    const first = await service.addWord({ word: 'serendipity' });
    expect(first.isDuplicate).toBe(true);

    const whitespaceVariation = await service.addWord({ word: '  SERENDIPITY  ' });
    expect(whitespaceVariation.isDuplicate).toBe(true);
    expect(whitespaceVariation.word.id).toBe(first.word.id);
  });

  it('adds a trimmed word to the local library without requiring a definition', async () => {
    const added = await service.addWord({ word: '  perspicacious  ' });

    expect(added.isDuplicate).toBe(false);
    expect(added.word.displayWord).toBe('perspicacious');
    expect(repo.findWordByNormalized('perspicacious', 'en')?.id).toBe(added.word.id);
    expect(repo.getDefinitionsForWord(added.word.id)).toEqual([]);
  });

  it('verifies a new word with Gemini and saves its definitions and examples', async () => {
    const wordCountBefore = repo.getWordsCount();
    vi.spyOn(mockGemini, 'generateStructured').mockResolvedValueOnce({
      word: 'perspicacious',
      language: 'en',
      recognized: true,
      senses: [{
        partOfSpeech: 'adjective',
        definition: 'Having a ready insight into and understanding of things.',
        synonyms: ['perceptive', 'observant'],
        examples: Array.from({ length: 6 }, (_, index) => ({
          example: `The perspicacious editor caught the subtle error in example ${index + 1}.`,
          voice: index === 1 ? 'passive' : 'active' as const
        }))
      }]
    });

    const result = await service.verifyAndAddWord({ word: '  perspicacious  ' });

    expect(result.status).toBe('added');
    if (result.status !== 'added') throw new Error('Expected the verified word to be added.');
    expect(result.word.displayWord).toBe('perspicacious');
    expect(result.definitions[0].examples).toHaveLength(6);
    expect(result.definitions[0].synonyms).toEqual(['perceptive', 'observant']);
    expect(repo.getWordsCount()).toBe(wordCountBefore + 1);
    expect(repo.getDefinitionsForWord(result.word.id)[0].examples).toHaveLength(6);
    expect(repo.getDefinitionsForWord(result.word.id)[0].synonyms).toEqual(['perceptive', 'observant']);
  });

  it('does not add an unrecognized term', async () => {
    vi.spyOn(mockGemini, 'generateStructured').mockResolvedValueOnce({
      word: 'xyzqwerty987', language: 'en', recognized: false, senses: []
    });

    const result = await service.verifyAndAddWord({ word: 'xyzqwerty987' });

    expect(result.status).toBe('unrecognized');
    expect(repo.findWordByNormalized('xyzqwerty987', 'en')).toBeNull();
  });

  it('returns corrected spelling options without saving a misspelled word', async () => {
    vi.spyOn(mockGemini, 'generateStructured').mockResolvedValueOnce({
      word: 'commiserating', language: 'en', recognized: false, senses: [],
      suggestions: ['commiserating', 'commiserate']
    });

    const result = await service.verifyAndAddWord({ word: 'comisserating' });

    expect(result).toEqual({ status: 'suggestions', enteredWord: 'comisserating', suggestions: ['commiserating', 'commiserate'] });
    expect(repo.findWordByNormalized('comisserating', 'en')).toBeNull();
    expect(repo.findWordByNormalized('commiserating', 'en')).toBeNull();
  });

  it('turns Gemini lookup failures into a user-facing result without throwing an IPC exception', async () => {
    vi.spyOn(mockGemini, 'generateStructured').mockRejectedValueOnce(new Error('Gemini request failed: Network connection failed.'));

    await expect(service.verifyAndAddWord({ word: 'comisserating' })).resolves.toMatchObject({
      status: 'error', enteredWord: 'comisserating', message: 'Gemini request failed: Network connection failed.'
    });
    expect(repo.findWordByNormalized('comisserating', 'en')).toBeNull();
  });

  it('requires a configured Gemini key before verifying a new term', async () => {
    vi.spyOn(mockGemini, 'getApiKey').mockReturnValueOnce(null);
    const generateSpy = vi.spyOn(mockGemini, 'generateStructured');

    await expect(service.verifyAndAddWord({ word: 'perspicacious' })).rejects.toThrow(/Add a Gemini API key/);
    expect(generateSpy).not.toHaveBeenCalled();
    expect(repo.findWordByNormalized('perspicacious', 'en')).toBeNull();
  });

  it('does not call Gemini for a word already in the library', async () => {
    const generateSpy = vi.spyOn(mockGemini, 'generateStructured');
    const result = await service.verifyAndAddWord({ word: '  LUCID ' });

    expect(result.status).toBe('duplicate');
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it('rolls back a word if its definition examples fail to persist', () => {
    expect(() => repo.createWordWithDefinitions('transactional', 'transactional', 'en', [{
      partOfSpeech: 'noun',
      definition: 'A transactional test value.',
      examples: [{ example: 'This example should fail during insertion.', voice: 'invalid' as never }],
      source: 'gemini'
    }])).toThrow();

    expect(repo.findWordByNormalized('transactional', 'en')).toBeNull();
  });
});
