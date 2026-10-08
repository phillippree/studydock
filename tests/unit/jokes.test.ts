import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DatabaseConstructor, { Database } from 'better-sqlite3';
import { MigrationRunner } from '../../src/main/database/migrations';
import { jokesExamplesMigration, jokesMigration } from '../../src/main/modes/jokes/migration';
import { JokesRepository } from '../../src/main/modes/jokes/repository';
import { JokesService } from '../../src/main/modes/jokes/service';
import { validateJokeLookup } from '../../src/main/modes/jokes/schema';
import { GeminiClient } from '../../src/main/gemini/client';
import { SettingsService } from '../../src/main/settings/service';

describe('Punchlines & Jokes mode', () => {
  let db: Database;
  let repository: JokesRepository;
  let gemini: GeminiClient;
  let service: JokesService;

  beforeEach(() => {
    db = new DatabaseConstructor(':memory:');
    db.pragma('foreign_keys = ON');
    new MigrationRunner(db).runMigrations([jokesMigration, jokesExamplesMigration]);
    repository = new JokesRepository(db);
    gemini = new GeminiClient();
    const settings = new SettingsService();
    vi.spyOn(gemini, 'getApiKey').mockReturnValue('fake-jokes-test-key');
    vi.spyOn(settings, 'getModel').mockReturnValue('gemini-test-model');
    service = new JokesService(repository, gemini, settings);
  });

  afterEach(() => { db.close(); vi.restoreAllMocks(); });

  const examples = [
    { example: 'Maya told the banker joke at lunch, and everyone laughed at the double meaning.', voice: 'active' as const },
    { example: 'The banker joke was shared at lunch, and everyone laughed at the double meaning.', voice: 'passive' as const },
    { example: 'The comedian delivered the punchline after a long pause.', voice: 'active' as const },
    { example: 'The punchline was delivered after a long pause, which made the audience laugh.', voice: 'passive' as const },
    { example: 'Jordan repeated the joke to explain why the wordplay was clever.', voice: 'active' as const },
    { example: 'The joke was repeated later because its wordplay was so clever.', voice: 'passive' as const }
  ];

  it('returns faithful wording choices and saves only the selected variation', async () => {
    vi.spyOn(gemini, 'generateStructured').mockResolvedValueOnce({
      submittedText: 'who needs a hairstylist when I have a pillow', type: 'joke', language: 'en', recognized: true,
      variations: [
        { text: "I don't need a hairstylist; I have my pillow.", explanation: 'The joke frames bedhead as a styling choice.', examples },
        { text: 'Who needs a hairstylist? That is what my pillow is for.', explanation: 'The speaker treats a pillow as a playful substitute for hairstyling.', examples }
      ]
    });
    const result = await service.lookup('who needs a hairstylist when I have a pillow', 'joke');
    expect(result.status).toBe('choices');
    if (result.status !== 'choices') throw new Error('Expected wording choices');
    expect(result.choices.map(choice => choice.text)).toEqual([
      "I don't need a hairstylist; I have my pillow.",
      'Who needs a hairstylist? That is what my pillow is for.'
    ]);
    expect(repository.list({ offset: 0, limit: 6 }).total).toBe(0);
    expect(service.savePreview(result.choices[1].token)).toMatchObject({ status: 'saved', entry: { type: 'joke', text: 'Who needs a hairstylist? That is what my pillow is for.' } });
    const saved = repository.list({ offset: 0, limit: 6 });
    expect(saved.total).toBe(1);
    expect(saved.entries[0].examples).toHaveLength(6);
    expect(saved.entries[0].examples.map(example => example.voice)).toEqual(['active', 'passive', 'active', 'passive', 'active', 'passive']);
    expect(db.prepare('SELECT COUNT(*) AS count FROM jokes_examples').get()).toMatchObject({ count: 6 });
  });

  it('returns unrecognized content when Gemini omits the explanation', async () => {
    const raw = { submittedText: 'A normal sentence.', type: 'punchline', language: 'en', recognized: false, variations: [], suggestion: null };
    vi.spyOn(gemini, 'generateStructured').mockImplementationOnce(async request => request.schemaValidator(raw));
    await expect(service.lookup('A normal sentence.', 'punchline')).resolves.toMatchObject({ status: 'unrecognized' });
    expect(repository.list({ offset: 0, limit: 6 }).total).toBe(0);
    expect(() => validateJokeLookup(raw, raw.submittedText, 'punchline', 'en')).not.toThrow();
  });

  it('filters and searches the independent local library', () => {
    repository.save({ text: 'A banker joke about interest', normalizedText: 'a banker joke about interest', type: 'joke', language: 'en', explanation: 'A wordplay joke.', examples });
    repository.save({ text: 'The final line', normalizedText: 'the final line', type: 'punchline', language: 'en', explanation: 'Needs its setup.', examples });
    expect(repository.list({ type: 'punchline', search: 'setup', offset: 0, limit: 6 }).entries.map(entry => entry.type)).toEqual(['punchline']);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='jokes_entries'").get()).toBeTruthy();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='jokes_examples'").get()).toBeTruthy();
  });

  it('rejects recognized Gemini results without six examples in both voices', () => {
    const raw = {
      submittedText: 'A clean joke.', type: 'joke', language: 'en', recognized: true,
      variations: [
        { text: 'A clean joke version.', explanation: 'A short explanation of the joke.', examples: examples.slice(0, 3) },
        { text: 'Another clean joke version.', explanation: 'A short explanation of the joke.', examples: examples.slice(0, 3) }
      ]
    };
    expect(() => validateJokeLookup(raw, raw.submittedText, 'joke', 'en')).toThrow(/exactly six/);
    expect(() => validateJokeLookup({ ...raw, variations: raw.variations.map(variation => ({ ...variation, examples: examples.map(item => ({ ...item, voice: 'active' })) })) }, raw.submittedText, 'joke', 'en')).toThrow(/active and passive/);
  });

  it('accepts wording variations that preserve the submitted idea without exact text matching', () => {
    const raw = {
      submittedText: 'who needs a hairstylist when I have a pillow', type: 'joke', language: 'en', recognized: true,
      variations: [
        { text: "I don't need a hairstylist; I have my pillow.", explanation: 'The joke frames bedhead as a styling choice.', examples },
        { text: 'Who needs a hairstylist? My pillow takes care of that.', explanation: 'The speaker jokes that a pillow provides their hairstyle.', examples }
      ]
    };
    expect(validateJokeLookup(raw, raw.submittedText, 'joke', 'en')).toMatchObject({ recognized: true, variations: [{ text: raw.variations[0].text }, { text: raw.variations[1].text }] });
    const quoteOnly = {
      ...raw,
      variations: [
        { ...raw.variations[0], text: 'She joked, “who needs a hairstylist when I have a pillow,” before leaving.' },
        raw.variations[1]
      ]
    };
    expect(() => validateJokeLookup(quoteOnly, raw.submittedText, 'joke', 'en')).toThrow(/rewrite the joke itself/);
  });
});
