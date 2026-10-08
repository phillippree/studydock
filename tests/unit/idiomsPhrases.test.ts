import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DatabaseConstructor, { Database } from 'better-sqlite3';
import { MigrationRunner } from '../../src/main/database/migrations';
import { idiomsPhrasesExampleVoiceMigration, idiomsPhrasesMigration } from '../../src/main/modes/idioms-phrases/migration';
import { IdiomsPhrasesRepository } from '../../src/main/modes/idioms-phrases/repository';
import { IdiomsPhrasesService } from '../../src/main/modes/idioms-phrases/service';
import { GeminiClient } from '../../src/main/gemini/client';
import { SettingsService } from '../../src/main/settings/service';
import { validateExpressionLookup } from '../../src/main/modes/idioms-phrases/schema';

describe('Idioms & Phrases mode', () => {
  const sixExamples = [
    { example: 'Maya told a joke to break the ice at the meeting.', voice: 'active' as const },
    { example: 'The ice was broken by Maya with a joke.', voice: 'passive' as const },
    { example: 'A short game helped break the ice.', voice: 'active' as const },
    { example: 'The ice was broken by a short game.', voice: 'passive' as const },
    { example: 'They broke the ice before the presentation.', voice: 'active' as const },
    { example: 'The ice was broken before the presentation.', voice: 'passive' as const }
  ];
  let db: Database;
  let repository: IdiomsPhrasesRepository;
  let gemini: GeminiClient;
  let service: IdiomsPhrasesService;

  beforeEach(() => {
    db = new DatabaseConstructor(':memory:');
    db.pragma('foreign_keys = ON');
    new MigrationRunner(db).runMigrations([idiomsPhrasesMigration, idiomsPhrasesExampleVoiceMigration]);
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

  it('previews a verified idiom without saving until requested', async () => {
    vi.spyOn(gemini, 'generateStructured').mockResolvedValueOnce({
      expression: 'break the ice',
      type: 'idiom',
      language: 'en',
      recognized: true,
      meaning: 'To make people feel more relaxed in a social setting.',
      examples: sixExamples
    });

    const preview = await service.lookup(' break   the ice ', 'idiom');
    expect(preview.status).toBe('preview');
    if (preview.status !== 'preview') throw new Error('Expected a lookup preview');
    expect(preview.examples).toHaveLength(6);
    expect(preview.examples[1].voice).toBe('passive');
    expect(repository.find('break the ice', 'idiom', 'en')).toBeNull();

    const result = service.savePreview(preview.token);
    expect(result.status).toBe('saved');
    expect(result.entry.examples).toHaveLength(6);
    expect(result.entry.examples[1].voice).toBe('passive');
    expect(repository.find('break the ice', 'idiom', 'en')?.meaning).toContain('relaxed');
    expect(repository.find('break the ice', 'idiom', 'en')?.examples[1].voice).toBe('passive');
    expect(repository.list({ offset: 0, limit: 6 }).total).toBe(1);
  });

  it('accepts Gemini null suggestion when a recognized phrase has no correction', () => {
    expect(validateExpressionLookup({
      expression: 'speak of the devil', type: 'phrase', language: 'en', recognized: true,
      meaning: 'Someone being discussed appears unexpectedly.',
      examples: sixExamples,
      suggestion: null
    }, 'speak of the devil', 'en', 'phrase')).toMatchObject({
      recognized: true,
      meaning: 'Someone being discussed appears unexpectedly.',
      examples: sixExamples
    });
  });

  it('does not save unrecognized expressions', async () => {
    vi.spyOn(gemini, 'generateStructured').mockResolvedValueOnce({
      expression: 'blorp the moon', type: 'idiom', language: 'en', recognized: false, examples: [], suggestion: 'reach for the moon'
    });
    await expect(service.lookup('blorp the moon', 'idiom')).resolves.toMatchObject({ status: 'unrecognized', suggestion: 'reach for the moon' });
    expect(repository.list({ offset: 0, limit: 6 }).entries).toEqual([]);
  });

  it('extracts a clean suggested correction from Gemini explanatory text', () => {
    const typo = 'the little things in life matters';
    const correction = validateExpressionLookup({
      expression: typo, type: 'idiom', language: 'en', recognized: true,
      meaning: 'Small moments are important.', examples: sixExamples,
      suggestion: "The correct grammatical form is 'the little things in life matter' (plural subject)."
    }, typo, 'en', 'idiom');
    expect(correction).toEqual({
      expression: typo, language: 'en', recognized: false, examples: [],
      suggestion: 'the little things in life matter'
    });
  });

  it('returns a grammar correction instead of treating the ungrammatical entry as a valid preview', async () => {
    const rawResponse = {
      expression: 'the little things in life matters', type: 'idiom', language: 'en', recognized: true,
      meaning: 'Small moments are important.', examples: sixExamples,
      suggestion: "The correct grammatical form is 'the little things in life matter' (plural subject)."
    };
    vi.spyOn(gemini, 'generateStructured').mockImplementationOnce(async request => request.schemaValidator(rawResponse));
    await expect(service.lookup('the little things in life matters', 'idiom')).resolves.toMatchObject({
      status: 'unrecognized', suggestion: 'the little things in life matter'
    });
    expect(repository.list({ offset: 0, limit: 6 }).entries).toEqual([]);
  });

  it('returns the saved record for duplicates without another Gemini request', async () => {
    const existing = repository.save({
      expression: 'on the same page', normalizedExpression: 'on the same page', type: 'phrase', language: 'en',
      meaning: 'To share an understanding.', examples: ['The team is on the same page.']
    });
    expect(repository.getById(existing.id)?.examples[0].voice).toBe('other');
    const generate = vi.spyOn(gemini, 'generateStructured');
    await expect(service.lookup(' ON THE SAME PAGE ', 'phrase')).resolves.toMatchObject({ status: 'duplicate', entry: { id: existing.id } });
    expect(generate).not.toHaveBeenCalled();
  });

  it('returns an existing expression if it is saved after preview but before confirmation', async () => {
    vi.spyOn(gemini, 'generateStructured').mockResolvedValueOnce({
      expression: 'break the ice', type: 'idiom', language: 'en', recognized: true,
      meaning: 'Start a friendly conversation.', examples: sixExamples
    });
    const preview = await service.lookup('break the ice', 'idiom');
    if (preview.status !== 'preview') throw new Error('Expected a lookup preview');
    const existing = repository.save({
      expression: 'break the ice', normalizedExpression: 'break the ice', type: 'idiom', language: 'en',
      meaning: 'Already saved elsewhere.', examples: ['They broke the ice.']
    });

    expect(service.savePreview(preview.token)).toMatchObject({ status: 'duplicate', entry: { id: existing.id } });
    expect(repository.list({ offset: 0, limit: 6 }).total).toBe(1);
  });

  it('refreshes an expression into six voice-labeled examples without changing its meaning', async () => {
    const original = repository.save({
      expression: 'on the same page', normalizedExpression: 'on the same page', type: 'phrase', language: 'en',
      meaning: 'To share an understanding.', examples: ['The team is on the same page.']
    });
    const refreshedExamples = sixExamples.map((item, index) => ({ ...item, example: `New sentence ${index + 1} uses on the same page naturally.` }));
    vi.spyOn(gemini, 'generateStructured').mockResolvedValueOnce({
      expression: original.expression,
      type: original.type,
      language: original.language,
      recognized: true,
      meaning: 'A model-reworded meaning that should not replace the saved one.',
      examples: refreshedExamples
    });

    const updated = await service.refreshExamples(original.id);

    expect(updated.meaning).toBe(original.meaning);
    expect(updated.examples).toHaveLength(6);
    expect(updated.examples.map(example => example.example)).toEqual(refreshedExamples.map(example => example.example));
    expect(updated.examples[1].voice).toBe('passive');
  });

  it('preserves saved examples when refreshing fails', async () => {
    const original = repository.save({
      expression: 'on the same page', normalizedExpression: 'on the same page', type: 'phrase', language: 'en',
      meaning: 'To share an understanding.', examples: ['The team is on the same page.']
    });
    vi.spyOn(gemini, 'generateStructured').mockRejectedValueOnce(new Error('Network unavailable'));

    await expect(service.refreshExamples(original.id)).rejects.toThrow('Network unavailable');
    expect(repository.getById(original.id)?.examples).toEqual(original.examples);
  });

  it('does not save an unrecognized result', async () => {
    vi.spyOn(gemini, 'generateStructured').mockResolvedValueOnce({
      expression: 'spill the beans', type: 'idiom', language: 'en', recognized: false, examples: []
    });
    await expect(service.lookup('spill the beans', 'idiom')).resolves.toMatchObject({ status: 'unrecognized' });
    expect(repository.list({ offset: 0, limit: 6 }).entries).toEqual([]);
  });

  it('returns a stable slice and total count for pagination', () => {
    for (let index = 1; index <= 8; index++) {
      const expression = `expression ${index.toString().padStart(2, '0')}`;
      repository.save({
        expression,
        normalizedExpression: expression,
        type: index % 2 === 0 ? 'phrase' : 'idiom',
        language: 'en',
        meaning: `Meaning ${index}`,
        examples: [`Example ${index}`]
      });
    }

    const page = repository.list({ offset: 3, limit: 3 });
    expect(page.total).toBe(8);
    expect(page.entries.map(entry => entry.expression)).toEqual(['expression 04', 'expression 05', 'expression 06']);
  });

  it('applies search and type filters before counting and paging', () => {
    repository.save({ expression: 'break the ice', normalizedExpression: 'break the ice', type: 'idiom', language: 'en', meaning: 'Start a conversation', examples: ['They played a game.'] });
    repository.save({ expression: 'ice breaker', normalizedExpression: 'ice breaker', type: 'phrase', language: 'en', meaning: 'A conversation starter', examples: ['She told a story.'] });
    repository.save({ expression: 'hit the road', normalizedExpression: 'hit the road', type: 'idiom', language: 'en', meaning: 'Leave a place', examples: ['We left early.'] });

    const page = repository.list({ type: 'idiom', search: 'ice', offset: 0, limit: 1 });
    expect(page.total).toBe(1);
    expect(page.entries.map(entry => entry.expression)).toEqual(['break the ice']);
  });

  it('selects quiz prompts by category without exposing answers and avoids the previous prompt', () => {
    const first = repository.save({ expression: 'call it a day', normalizedExpression: 'call it a day', type: 'phrase', language: 'en', meaning: 'Stop working for the day.', examples: ['We called it a day.'] });
    repository.save({ expression: 'under the weather', normalizedExpression: 'under the weather', type: 'phrase', language: 'en', meaning: 'Feeling ill.', examples: ['I am under the weather.'] });
    repository.save({ expression: 'once in a blue moon', normalizedExpression: 'once in a blue moon', type: 'idiom', language: 'en', meaning: 'Very rarely.', examples: ['It happens once in a blue moon.'] });

    const prompt = repository.getRandomQuizPrompt('phrase');
    expect(prompt).not.toBeNull();
    expect(prompt?.type).toBe('phrase');
    expect(prompt).not.toHaveProperty('meaning');
    expect(prompt).not.toHaveProperty('examples');

    const nextPrompt = repository.getRandomQuizPrompt('phrase', prompt!.id);
    expect(nextPrompt?.type).toBe('phrase');
    expect(nextPrompt?.id).not.toBe(prompt?.id);
    expect(repository.getById(first.id)?.meaning).toBe('Stop working for the day.');
  });

  it('returns no quiz prompt when the library is empty', () => {
    expect(repository.getRandomQuizPrompt()).toBeNull();
  });

  it('rejects a response classified under a different requested type', () => {
    expect(validateExpressionLookup({
      expression: 'spill the beans', type: 'phrase', language: 'en', recognized: true,
      meaning: 'To reveal a secret.', examples: sixExamples
    }, 'spill the beans', 'en', 'idiom')).toMatchObject({ recognized: false });
  });

  it('requires six distinct examples for a recognized expression', () => {
    expect(() => validateExpressionLookup({
      expression: 'break the ice', type: 'idiom', language: 'en', recognized: true,
      meaning: 'Start a conversation.', examples: sixExamples.slice(0, 5)
    }, 'break the ice', 'en', 'idiom')).toThrow('exactly six examples');
  });
});
