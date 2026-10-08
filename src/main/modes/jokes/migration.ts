import { Database } from 'better-sqlite3';
import { Migration } from '../../database/migrations';

export const jokesMigration: Migration = {
  id: 'jokes_001_initial',
  name: 'Create Punchlines & Jokes library',
  modeId: 'jokes',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS jokes_entries (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        normalized_text TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('joke', 'punchline')),
        language TEXT NOT NULL,
        explanation TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (normalized_text, type, language)
      );
      CREATE INDEX IF NOT EXISTS idx_jokes_entries_order ON jokes_entries(type, text COLLATE NOCASE);
    `);
  }
};

export const jokesExamplesMigration: Migration = {
  id: 'jokes_002_examples',
  name: 'Add voice-labeled joke examples',
  modeId: 'jokes',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS jokes_examples (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL REFERENCES jokes_entries(id) ON DELETE CASCADE,
        example TEXT NOT NULL,
        voice TEXT NOT NULL CHECK (voice IN ('active', 'passive', 'other')),
        position INTEGER NOT NULL,
        UNIQUE (entry_id, position)
      );
      CREATE INDEX IF NOT EXISTS idx_jokes_examples_order ON jokes_examples(entry_id, position);
    `);
  }
};
