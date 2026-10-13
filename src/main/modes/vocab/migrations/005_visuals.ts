import { Database } from 'better-sqlite3';
import { Migration } from '../../../database/migrations';

export const migration005Visuals: Migration = {
  id: 'vocab_005_visuals',
  name: 'Store visual references for vocabulary meanings',
  modeId: 'vocab',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE vocab_definition_visuals (
        definition_id TEXT PRIMARY KEY REFERENCES vocab_definitions(id) ON DELETE CASCADE,
        caption TEXT NOT NULL,
        image_file TEXT NOT NULL,
        model_identifier TEXT NOT NULL,
        generated_at TEXT NOT NULL
      );
    `);
  }
};
