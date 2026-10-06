import { Database } from 'better-sqlite3';

export interface Migration {
  id: string;
  name: string;
  modeId: string;
  up: (db: Database) => void;
}

export class MigrationRunner {
  constructor(private db: Database) {
    this.initMigrationsTable();
  }

  private initMigrationsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id TEXT PRIMARY KEY,
        mode_id TEXT NOT NULL,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
  }

  public getAppliedMigrationIds(): Set<string> {
    const rows = this.db.prepare('SELECT id FROM _migrations').all() as Array<{ id: string }>;
    return new Set(rows.map(r => r.id));
  }

  public runMigrations(migrations: Migration[]): void {
    const applied = this.getAppliedMigrationIds();

    for (const migration of migrations) {
      if (!applied.has(migration.id)) {
        const runTransaction = this.db.transaction(() => {
          migration.up(this.db);
          this.db
            .prepare('INSERT INTO _migrations (id, mode_id, name, applied_at) VALUES (?, ?, ?, ?)')
            .run(migration.id, migration.modeId, migration.name, new Date().toISOString());
        });

        runTransaction();
      }
    }
  }
}
