import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DatabaseConstructor, { Database } from 'better-sqlite3';
import { MigrationRunner } from '../../src/main/database/migrations';
import { connectorsMigration } from '../../src/main/modes/connectors/migration';
import { ConnectorsRepository } from '../../src/main/modes/connectors/repository';
import { ConnectorsService } from '../../src/main/modes/connectors/service';
import { validateConnectorLookup } from '../../src/main/modes/connectors/schema';
import { GeminiClient } from '../../src/main/gemini/client';
import { SettingsService } from '../../src/main/settings/service';

describe('Connectors mode', () => {
  const examples = [
    { example: 'Maya wanted to leave; however, she stayed to help.', voice: 'active' as const },
    { example: 'The meeting was postponed; however, the guests were notified.', voice: 'passive' as const },
    { example: 'The team worked hard; therefore, they finished early.', voice: 'active' as const },
    { example: 'The proposal was reviewed; therefore, it was approved.', voice: 'passive' as const },
    { example: 'We took the earlier train; however, we still arrived late.', voice: 'active' as const },
    { example: 'The old route was closed; however, a detour was provided.', voice: 'passive' as const }
  ];
  let db: Database;
  let repository: ConnectorsRepository;
  let gemini: GeminiClient;
  let service: ConnectorsService;

  beforeEach(() => {
    db = new DatabaseConstructor(':memory:');
    db.pragma('foreign_keys = ON');
    new MigrationRunner(db).runMigrations([connectorsMigration]);
    repository = new ConnectorsRepository(db);
    gemini = new GeminiClient();
    const settings = new SettingsService();
    vi.spyOn(gemini, 'getApiKey').mockReturnValue('fake-connectors-test-key');
    vi.spyOn(settings, 'getModel').mockReturnValue('gemini-test-model');
    service = new ConnectorsService(repository, gemini, settings);
  });

  afterEach(() => { db.close(); vi.restoreAllMocks(); });

  it('previews a verified connector without writing until the user saves it', async () => {
    vi.spyOn(gemini, 'generateStructured').mockResolvedValueOnce({
      connector: 'however', category: 'contrast', language: 'en', recognized: true,
      meaning: 'Introduces a contrasting idea.', examples
    });
    const preview = await service.lookup('however');
    expect(preview.status).toBe('preview');
    if (preview.status !== 'preview') throw new Error('Expected a connector preview');
    expect(preview.examples).toHaveLength(6);
    expect(repository.find('however', 'en')).toBeNull();

    const saved = service.savePreview(preview.token);
    expect(saved).toMatchObject({ status: 'saved', entry: { category: 'contrast', meaning: 'Introduces a contrasting idea.' } });
    expect(saved.entry.examples).toHaveLength(6);
    expect(saved.entry.examples.map(item => item.voice)).toContain('passive');
    expect(repository.list({ offset: 0, limit: 6 }).total).toBe(1);
  });

  it('accepts a valid connector schema and rejects examples without both voices', () => {
    const valid = { connector: 'therefore', category: 'cause-effect', language: 'en', recognized: true, meaning: 'Shows a result.', examples };
    expect(validateConnectorLookup(valid, 'therefore', 'en').examples).toHaveLength(6);
    expect(validateConnectorLookup({ ...valid, suggestion: '' }, 'therefore', 'en').recognized).toBe(true);
    expect(validateConnectorLookup({ ...valid, suggestion: null }, 'therefore', 'en').recognized).toBe(true);
    expect(() => validateConnectorLookup({ ...valid, examples: examples.map(item => ({ ...item, voice: 'active' })) }, 'therefore', 'en')).toThrow(/active and passive/);
  });

  it('accepts an unrecognized connector with a null meaning and extracts selectable alternatives', () => {
    const result = validateConnectorLookup({
      connector: "I'd probably need a beer or two before we get into this conversation",
      category: 'condition', language: 'en', recognized: false, meaning: null, examples: [],
      suggestion: "The submitted text is a complete clause rather than a connector. If you intended to use a connector indicating a condition, consider using 'provided that', 'on the condition that', or 'as long as'."
    }, "I'd probably need a beer or two before we get into this conversation", 'en');
    expect(result).toMatchObject({
      recognized: false,
      suggestions: ['provided that', 'on the condition that', 'as long as']
    });
  });

  it('returns model alternatives for unrecognized connectors without saving them', async () => {
    const rawResponse = {
      connector: 'a full sentence', category: 'condition', language: 'en', recognized: false, meaning: null, examples: [],
      suggestion: "This is a complete sentence. Consider using 'provided that' or 'as long as'."
    };
    vi.spyOn(gemini, 'generateStructured').mockImplementationOnce(async request => request.schemaValidator(rawResponse));
    await expect(service.lookup('a full sentence')).resolves.toMatchObject({
      status: 'unrecognized', suggestions: ['provided that', 'as long as']
    });
    expect(repository.list({ offset: 0, limit: 6 }).entries).toEqual([]);
  });

  it('preserves the saved meaning when refreshing examples', async () => {
    const entry = repository.save({ connector: 'however', normalizedConnector: 'however', category: 'contrast', language: 'en', meaning: 'Saved meaning.', examples: examples.slice(0, 2) });
    vi.spyOn(gemini, 'generateStructured').mockResolvedValueOnce({
      connector: 'however', category: 'contrast', language: 'en', recognized: true,
      meaning: 'A generated alternate meaning.', examples: examples.map((item, index) => ({ ...item, example: `Replacement example ${index + 1}.` }))
    });
    const updated = await service.refreshExamples(entry.id);
    expect(updated.meaning).toBe('Saved meaning.');
    expect(updated.examples).toHaveLength(6);
  });
});
