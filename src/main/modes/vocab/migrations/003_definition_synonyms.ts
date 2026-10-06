import { Database } from 'better-sqlite3';
import { Migration } from '../../../database/migrations';

export const migration003DefinitionSynonyms: Migration = {
  id: 'vocab_003_definition_synonyms',
  name: 'Store synonyms per definition',
  modeId: 'vocab',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS vocab_definition_synonyms (
        id TEXT PRIMARY KEY,
        definition_id TEXT NOT NULL REFERENCES vocab_definitions(id) ON DELETE CASCADE,
        synonym TEXT NOT NULL,
        position INTEGER NOT NULL,
        UNIQUE (definition_id, position),
        UNIQUE (definition_id, synonym)
      );
      CREATE INDEX IF NOT EXISTS idx_vocab_definition_synonyms_order
        ON vocab_definition_synonyms(definition_id, position);
    `);
  }
};
