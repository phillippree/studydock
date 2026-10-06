import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import DatabaseConstructor, { Database } from 'better-sqlite3';
import { VocabRepository } from '../../src/main/modes/vocab/repository';
import { VocabService } from '../../src/main/modes/vocab/service';
import { GeminiClient } from '../../src/main/gemini/client';
import { SettingsService } from '../../src/main/settings/service';
import { MigrationRunner } from '../../src/main/database/migrations';
import { vocabMigrations } from '../../src/main/modes/vocab/migrations';

describe('Import and Export Functionality', () => {
  let db: Database;
  let repo: VocabRepository;
  let service: VocabService;

  beforeEach(() => {
    db = new DatabaseConstructor(':memory:');
    db.pragma('foreign_keys = ON');

    const runner = new MigrationRunner(db);
    runner.runMigrations(vocabMigrations);

    repo = new VocabRepository(db);
    service = new VocabService(repo, new GeminiClient(), new SettingsService());
  });

  afterEach(() => {
    db.close();
  });

  it('imports words from a text file, reporting imported, duplicate, and total counts', async () => {
    const importData = `
      lucid
      sonder
      effervescent
      lucid
      
      petrichor
    `;

    const result = await service.importWords(importData, 'en');
    expect(result.total).toBe(5); // 5 non-empty lines (lucid, sonder, effervescent, lucid, petrichor)
    expect(result.imported).toBe(3); // sonder, effervescent, petrichor
    expect(result.duplicates).toBe(2); // lucid was already in starter dataset, and also repeated in input
  });

  it('exports words and definitions accurately as structured JSON', async () => {
    const exportData = await service.exportData();
    expect(exportData.appName).toBe('StudyDock');
    expect(exportData.version).toBe(1);
    expect(exportData.words.length).toBeGreaterThanOrEqual(10);

    const lucid = exportData.words.find(w => w.normalizedWord === 'lucid');
    expect(lucid).toBeDefined();
    expect(lucid!.definitions.length).toBeGreaterThan(0);
    expect(lucid!.definitions[0].definition).toContain('Expressed clearly');
  });
});
