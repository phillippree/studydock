import DatabaseConstructor, { Database as DatabaseType } from 'better-sqlite3';
import { storagePaths } from '../storage/paths';
import path from 'path';
import fs from 'fs';

let dbInstance: DatabaseType | null = null;

export function getDatabase(customPath?: string): DatabaseType {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = customPath || storagePaths.getDatabasePath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseConstructor(dbPath, {
    // verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
  });

  // Enable foreign keys and WAL mode for performance & integrity
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  dbInstance = db;
  return db;
}

export function setDatabaseInstance(db: DatabaseType | null): void {
  dbInstance = db;
}

export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // Ignore close errors
    }
    dbInstance = null;
  }
}
