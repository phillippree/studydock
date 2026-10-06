import DatabaseConstructor, { Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WordQuizRepository } from '../../src/main/modes/word-quiz/repository';

describe('Word Quiz repository', () => {
  let db: Database;
  let repository: WordQuizRepository;

  beforeEach(() => {
    db = new DatabaseConstructor(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE vocab_words (
        id TEXT PRIMARY KEY,
        display_word TEXT NOT NULL,
        normalized_word TEXT NOT NULL,
        language TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT
      );
      CREATE TABLE vocab_definitions (
        id TEXT PRIMARY KEY,
        word_id TEXT NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
        part_of_speech TEXT NOT NULL,
        definition TEXT NOT NULL,
        example TEXT NOT NULL,
        source TEXT NOT NULL,
        model_identifier TEXT,
        prompt_version INTEGER,
        generated_at TEXT NOT NULL,
        updated_at TEXT
      );
      CREATE TABLE vocab_definition_examples (
        id TEXT PRIMARY KEY,
        definition_id TEXT NOT NULL REFERENCES vocab_definitions(id) ON DELETE CASCADE,
        example TEXT NOT NULL,
        position INTEGER NOT NULL,
        voice TEXT NOT NULL
      );
    `);
    repository = new WordQuizRepository(db);
  });

  afterEach(() => db.close());

  function addWord(id: string, displayWord: string, definition?: string): void {
    db.prepare(`
      INSERT INTO vocab_words (id, display_word, normalized_word, language, created_at)
      VALUES (?, ?, ?, 'en', '2026-01-01T00:00:00.000Z')
    `).run(id, displayWord, displayWord.toLowerCase());

    if (definition) {
      db.prepare(`
        INSERT INTO vocab_definitions (
          id, word_id, part_of_speech, definition, example, source, generated_at
        ) VALUES (?, ?, 'noun', ?, ?, 'local', '2026-01-01T00:00:00.000Z')
      `).run(`definition-${id}`, id, definition, `Example for ${displayWord}.`);
      db.prepare(`
        INSERT INTO vocab_definition_examples (id, definition_id, example, position, voice)
        VALUES (?, ?, ?, 1, 'active')
      `).run(`example-${id}`, `definition-${id}`, `Example for ${displayWord}.`);
    }
  }

  it('selects only words that have saved definitions', () => {
    addWord('word-1', 'ephemeral');
    addWord('word-2', 'lucid', 'Clear and easy to understand.');

    expect(repository.getRandomWord()).toMatchObject({
      id: 'word-2',
      displayWord: 'lucid',
      normalizedWord: 'lucid',
      language: 'en'
    });
  });

  it('returns null when no words have saved definitions', () => {
    addWord('word-1', 'ephemeral');

    expect(repository.getRandomWord()).toBeNull();
  });

  it('avoids the previous word when another defined word is available', () => {
    addWord('word-1', 'lucid', 'Clear and easy to understand.');
    addWord('word-2', 'vivid', 'Producing strong, clear images.');

    expect(repository.getRandomWord('word-1')?.id).toBe('word-2');
  });

  it('repeats the only eligible word instead of returning no quiz card', () => {
    addWord('word-1', 'lucid', 'Clear and easy to understand.');

    expect(repository.getRandomWord('word-1')?.id).toBe('word-1');
  });

  it('returns the saved definitions for the revealed word only', () => {
    addWord('word-1', 'lucid', 'Clear and easy to understand.');
    addWord('word-2', 'vivid', 'Producing strong, clear images.');

    expect(repository.getDefinitions('word-1')).toMatchObject([
      {
        id: 'definition-word-1',
        wordId: 'word-1',
        partOfSpeech: 'noun',
        definition: 'Clear and easy to understand.',
        example: 'Example for lucid.',
        examples: [{
          id: 'example-word-1',
          example: 'Example for lucid.',
          position: 1,
          voice: 'active'
        }],
        source: 'local'
      }
    ]);
    expect(repository.getDefinitions('missing-word')).toEqual([]);
  });
});
