import DatabaseConstructor from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LibraryTransferService } from '../../src/main/libraryTransfer/service';
import { migration001Initial } from '../../src/main/modes/vocab/migrations/001_initial';
import { idiomsPhrasesExampleVoiceMigration, idiomsPhrasesMigration } from '../../src/main/modes/idioms-phrases/migration';
import { connectorsMigration } from '../../src/main/modes/connectors/migration';
import { jokesExamplesMigration, jokesMigration } from '../../src/main/modes/jokes/migration';

describe('library list transfer', () => {
  let db: DatabaseConstructor.Database;
  let transfer: LibraryTransferService;

  beforeEach(() => {
    db = new DatabaseConstructor(':memory:');
    db.pragma('foreign_keys = ON');
    for (const migration of [migration001Initial, idiomsPhrasesMigration, idiomsPhrasesExampleVoiceMigration, connectorsMigration, jokesMigration, jokesExamplesMigration]) migration.up(db);
    transfer = new LibraryTransferService(db);
  });
  afterEach(() => db.close());

  it('exports only collection labels and imports every mode without generated details', () => {
    const file = transfer.parse(JSON.stringify({
      format: 'studydock-library-list', version: 1, exportedAt: '2026-10-11T00:00:00.000Z',
      words: [{ text: 'Serendipity', language: 'en' }, { text: 'Newword', language: 'en' }],
      expressions: [{ text: 'break the ice', type: 'idiom', language: 'en' }],
      connectors: [{ text: 'however', category: 'contrast', language: 'en' }],
      jokes: [{ text: 'Who needs a hairstylist when I have a pillow?', type: 'joke', language: 'en' }]
    }));
    const result = transfer.importList(file);
    expect(result.imported).toEqual({ words: 1, expressions: 1, connectors: 1, jokes: 1 });
    expect(result.skipped.words).toBe(1);
    expect(db.prepare('SELECT meaning FROM idioms_phrases_entries').get()).toEqual({ meaning: '' });
    expect(db.prepare('SELECT meaning FROM connectors_entries').get()).toEqual({ meaning: '' });
    expect(db.prepare('SELECT explanation FROM jokes_entries').get()).toEqual({ explanation: '' });
    const exported = transfer.exportList();
    expect(exported.expressions).toEqual([{ text: 'break the ice', type: 'idiom', language: 'en' }]);
    expect(exported.connectors).toEqual([{ text: 'however', category: 'contrast', language: 'en' }]);
    expect(exported.jokes).toEqual([{ text: 'Who needs a hairstylist when I have a pillow?', type: 'joke', language: 'en' }]);
    expect(JSON.stringify(exported)).not.toContain('definition');
    expect(transfer.importList(file).skipped).toEqual({ words: 2, expressions: 1, connectors: 1, jokes: 1 });
  });

  it('rejects malformed files before writing and rolls back a failed import', () => {
    expect(() => transfer.parse('{')).toThrow('not a valid JSON');
    expect(() => transfer.parse(JSON.stringify({ format: 'studydock-library-list', version: 2 }))).toThrow('not a supported');
    const file = transfer.parse(JSON.stringify({
      format: 'studydock-library-list', version: 1, exportedAt: '2026-10-11T00:00:00.000Z',
      words: [{ text: 'Newword', language: 'en' }], expressions: [],
      connectors: [{ text: 'however', category: 'contrast', language: 'en' }], jokes: []
    }));
    db.exec("CREATE TRIGGER reject_connector BEFORE INSERT ON connectors_entries BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    expect(() => transfer.importList(file)).toThrow('test failure');
    expect(db.prepare("SELECT COUNT(*) AS total FROM vocab_words WHERE normalized_word = 'newword'").get()).toEqual({ total: 0 });
  });
});
