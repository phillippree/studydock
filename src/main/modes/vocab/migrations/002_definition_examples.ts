import { Database } from 'better-sqlite3';
import { Migration } from '../../../database/migrations';

export const migration002DefinitionExamples: Migration = {
  id: 'vocab_002_definition_examples',
  name: 'Store multiple examples per definition',
  modeId: 'vocab',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS vocab_definition_examples (
        id TEXT PRIMARY KEY,
        definition_id TEXT NOT NULL REFERENCES vocab_definitions(id) ON DELETE CASCADE,
        example TEXT NOT NULL,
        position INTEGER NOT NULL,
        voice TEXT NOT NULL CHECK (voice IN ('active', 'passive', 'other')),
        UNIQUE (definition_id, position)
      );
      CREATE INDEX IF NOT EXISTS idx_vocab_definition_examples_order
        ON vocab_definition_examples(definition_id, position);

      INSERT OR IGNORE INTO vocab_definition_examples (id, definition_id, example, position, voice)
      SELECT 'example_' || id || '_1', id, example, 1, 'other'
      FROM vocab_definitions
      WHERE TRIM(example) != '';
    `);
  }
};
