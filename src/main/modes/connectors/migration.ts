import { Database } from 'better-sqlite3';
import { Migration } from '../../database/migrations';

export const connectorsMigration: Migration = {
  id: 'connectors_001_initial',
  name: 'Create Connectors library',
  modeId: 'connectors',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS connectors_entries (
        id TEXT PRIMARY KEY,
        connector TEXT NOT NULL,
        normalized_connector TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('addition', 'contrast', 'cause-effect', 'sequence', 'example', 'conclusion', 'condition', 'comparison', 'conjunction')),
        language TEXT NOT NULL,
        meaning TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (normalized_connector, language)
      );
      CREATE INDEX IF NOT EXISTS idx_connectors_entries_order
        ON connectors_entries(category, connector COLLATE NOCASE);
      CREATE TABLE IF NOT EXISTS connectors_examples (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL REFERENCES connectors_entries(id) ON DELETE CASCADE,
        example TEXT NOT NULL,
        position INTEGER NOT NULL,
        voice TEXT NOT NULL CHECK (voice IN ('active', 'passive', 'other')),
        UNIQUE (entry_id, position)
      );
      CREATE INDEX IF NOT EXISTS idx_connectors_examples_order
        ON connectors_examples(entry_id, position);
    `);
  }
};
