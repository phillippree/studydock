import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import DatabaseConstructor, { Database } from 'better-sqlite3';
import { MigrationRunner } from '../../src/main/database/migrations';
import { vocabMigrations } from '../../src/main/modes/vocab/migrations';
import { migration001Initial } from '../../src/main/modes/vocab/migrations/001_initial';
import { migration002DefinitionExamples } from '../../src/main/modes/vocab/migrations/002_definition_examples';
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
    const migrated = new VocabRepository(db).getDefinitionsForWord(word.id)[0];

    expect(migrated.examples).toEqual([{
      id: `example_${original.id}_1`,
      example: original.example,
      position: 1,
      voice: 'other'
    }]);
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
    repo.addDefinition(word.id, 'noun', 'Meaning of original', 'Example of original');

    expect(repo.getDefinitionsForWord(word.id)).toHaveLength(1);

    // Update word to completely different term
    const updated = repo.updateWord(word.id, 'changed', 'changed', 'en');
    expect(updated.normalizedChanged).toBe(true);

    // Old definitions should have been cleared
    expect(repo.getDefinitionsForWord(word.id)).toHaveLength(0);
  });
});
