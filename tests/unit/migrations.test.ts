import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import DatabaseConstructor, { Database } from 'better-sqlite3';
import { MigrationRunner } from '../../src/main/database/migrations';
import { vocabMigrations } from '../../src/main/modes/vocab/migrations';
import { migration001Initial } from '../../src/main/modes/vocab/migrations/001_initial';
import { migration002DefinitionExamples } from '../../src/main/modes/vocab/migrations/002_definition_examples';
import { migration003DefinitionSynonyms } from '../../src/main/modes/vocab/migrations/003_definition_synonyms';
import { migration004RelatedForms } from '../../src/main/modes/vocab/migrations/004_related_forms';
import { VocabRepository } from '../../src/main/modes/vocab/repository';

describe('Database Migrations and Starter Data', () => {
  let db: Database;

  beforeEach(() => {
    db = new DatabaseConstructor(':memory:');
    db.pragma('foreign_keys = ON');
  });

  afterEach(() => {
    db.close();
  });

  it('runs initial migrations and seeds starter words', () => {
    const runner = new MigrationRunner(db);
    runner.runMigrations(vocabMigrations);

    const applied = runner.getAppliedMigrationIds();
    expect(applied.has('vocab_001_initial')).toBe(true);

    const repo = new VocabRepository(db);
    const count = repo.getWordsCount();
    expect(count).toBeGreaterThanOrEqual(10);

    const all = repo.getAllWords();
    const lucid = all.find(w => w.normalizedWord === 'lucid');
    expect(lucid).toBeDefined();
    expect(lucid!.definitionCount).toBeGreaterThan(0);
  });

  it('does not re-seed or overwrite deleted starter words on subsequent migration runs', () => {
    const runner = new MigrationRunner(db);
    runner.runMigrations(vocabMigrations);

    const repo = new VocabRepository(db);
    const initialCount = repo.getWordsCount();

    // Delete one word
    const all = repo.getAllWords();
    repo.deleteWord(all[0].id);
    expect(repo.getWordsCount()).toBe(initialCount - 1);

    // Re-run migration runner
    runner.runMigrations(vocabMigrations);
    // Count should still remain initialCount - 1 (never re-seeded)
    expect(repo.getWordsCount()).toBe(initialCount - 1);
  });

  it('preserves existing single examples when adding the examples table', () => {
    const runner = new MigrationRunner(db);
    runner.runMigrations([migration001Initial]);
    const word = db.prepare(`SELECT id FROM vocab_words WHERE normalized_word = 'resilient'`).get() as { id: string };
    const original = db.prepare(`SELECT id, example FROM vocab_definitions WHERE word_id = ?`).get(word.id) as { id: string; example: string };

    runner.runMigrations([migration002DefinitionExamples]);
    runner.runMigrations([migration003DefinitionSynonyms]);
    const migrated = new VocabRepository(db).getDefinitionsForWord(word.id)[0];

    expect(migrated.examples).toEqual([{
      id: `example_${original.id}_1`,
      example: original.example,
      position: 1,
      voice: 'other'
    }]);
  });

  it('adds per-definition synonym storage without altering existing definitions', () => {
    const runner = new MigrationRunner(db);
    runner.runMigrations([migration001Initial, migration002DefinitionExamples]);
    const word = db.prepare(`SELECT id FROM vocab_words WHERE normalized_word = 'resilient'`).get() as { id: string };
    const before = db.prepare(`SELECT id, definition FROM vocab_definitions WHERE word_id = ? ORDER BY id`).all(word.id) as Array<{ id: string; definition: string }>;

    runner.runMigrations([migration003DefinitionSynonyms]);
    const after = new VocabRepository(db).getDefinitionsForWord(word.id);

    expect(after).toHaveLength(before.length);
    expect(after[0].definition).toBe(before[0].definition);
    expect(after[0].synonyms).toEqual([]);
  });

  it('adds related-form storage without changing existing words or definitions', () => {
    const runner = new MigrationRunner(db);
    runner.runMigrations([migration001Initial, migration002DefinitionExamples, migration003DefinitionSynonyms]);
    const repo = new VocabRepository(db);
    const word = repo.findWordByNormalized('resilient', 'en')!;
    const definitions = repo.getDefinitionsForWord(word.id);

    runner.runMigrations([migration004RelatedForms]);

    expect(repo.getDefinitionsForWord(word.id)).toEqual(definitions);
    expect(repo.getRelatedFormsForWord(word.id)).toEqual([]);
    expect(runner.getAppliedMigrationIds().has('vocab_004_related_forms')).toBe(true);
  });

  it('enforces cascade deletion of definitions when word is deleted', () => {
    const runner = new MigrationRunner(db);
    runner.runMigrations(vocabMigrations);

    const repo = new VocabRepository(db);
    const word = repo.createWord('testword', 'testword', 'en');
    repo.addDefinition(word.id, 'noun', 'A test definition', 'A test example');

    expect(repo.getDefinitionsForWord(word.id)).toHaveLength(1);

    // Delete word
    repo.deleteWord(word.id);

    // Verify definitions are removed
    expect(repo.getDefinitionsForWord(word.id)).toHaveLength(0);
  });

  it('clears definitions if word normalized text is edited', () => {
    const runner = new MigrationRunner(db);
    runner.runMigrations(vocabMigrations);

    const repo = new VocabRepository(db);
    const word = repo.createWord('original', 'original', 'en');
    repo.replaceDefinitions(word.id, [{ partOfSpeech: 'noun', definition: 'Meaning of original', example: 'Example of original', source: 'manual' }], [
      { form: 'originality', partOfSpeech: 'noun' }
    ]);

    expect(repo.getDefinitionsForWord(word.id)).toHaveLength(1);

    // Update word to completely different term
    const updated = repo.updateWord(word.id, 'changed', 'changed', 'en');
    expect(updated.normalizedChanged).toBe(true);

    // Old definitions should have been cleared
    expect(repo.getDefinitionsForWord(word.id)).toHaveLength(0);
    expect(repo.getRelatedFormsForWord(word.id)).toEqual([]);
  });

  it('rolls back a refresh if related forms cannot be saved', () => {
    new MigrationRunner(db).runMigrations(vocabMigrations);
    const repo = new VocabRepository(db);
    const word = repo.createWord('steady', 'steady', 'en');
    repo.replaceDefinitions(word.id, [{ partOfSpeech: 'adjective', definition: 'Firm and consistent.', example: 'The pace is steady.', source: 'manual' }], [
      { form: 'steadiness', partOfSpeech: 'noun' }
    ]);
    const original = repo.getDefinitionsForWord(word.id);
    db.exec(`CREATE TRIGGER reject_related BEFORE INSERT ON vocab_related_forms BEGIN SELECT RAISE(ABORT, 'blocked'); END;`);

    expect(() => repo.replaceDefinitions(word.id, [{ partOfSpeech: 'adjective', definition: 'Changed meaning.', example: 'A changed example.', source: 'gemini' }], [
      { form: 'steadily', partOfSpeech: 'adverb' }
    ])).toThrow(/blocked/);

    expect(repo.getDefinitionsForWord(word.id)).toEqual(original);
    expect(repo.getRelatedFormsForWord(word.id)).toEqual([{ form: 'steadiness', partOfSpeech: 'noun' }]);
  });
});
