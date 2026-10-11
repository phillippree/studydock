import { Database } from 'better-sqlite3';
import { Migration } from '../../../database/migrations';

export const migration004RelatedForms: Migration = {
  id: 'vocab_004_related_forms',
  name: 'Store related word forms',
  modeId: 'vocab',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE vocab_related_forms (
        word_id TEXT NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
        form TEXT NOT NULL,
        part_of_speech TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (word_id, position)
      );
    `);
  }
};
