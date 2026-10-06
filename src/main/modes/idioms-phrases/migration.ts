import { Database } from 'better-sqlite3';
import { Migration } from '../../database/migrations';

export const idiomsPhrasesMigration: Migration = {
  id: 'idioms_phrases_001_initial',
  name: 'Create Idioms & Phrases library',
  modeId: 'idioms-phrases',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS idioms_phrases_entries (
        id TEXT PRIMARY KEY,
        expression TEXT NOT NULL,
        normalized_expression TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('idiom', 'phrase')),
        language TEXT NOT NULL,
        meaning TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (normalized_expression, type, language)
      );
      CREATE INDEX IF NOT EXISTS idx_idioms_phrases_entries_order
        ON idioms_phrases_entries(type, expression COLLATE NOCASE);
      CREATE TABLE IF NOT EXISTS idioms_phrases_examples (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL REFERENCES idioms_phrases_entries(id) ON DELETE CASCADE,
        example TEXT NOT NULL,
        position INTEGER NOT NULL,
        UNIQUE (entry_id, position)
      );
      CREATE INDEX IF NOT EXISTS idx_idioms_phrases_examples_order
        ON idioms_phrases_examples(entry_id, position);
    `);
  }
};
