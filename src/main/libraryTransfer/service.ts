import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { z } from 'zod';
import { CONNECTOR_CATEGORIES } from '../../shared/contracts/connectors';
import { LibraryImportResult, LibraryTransferCounts, LibraryTransferFile } from '../../shared/contracts/libraryTransfer';

const language = z.string().trim().min(2).max(20).regex(/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{2,8})*$/);
const text = (limit: number) => z.string().trim().min(1).max(limit);
const fileSchema = z.object({
  format: z.literal('studydock-library-list'),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  words: z.array(z.object({ text: text(100), language })).max(100000),
  expressions: z.array(z.object({ text: text(120), type: z.enum(['idiom', 'phrase']), language })).max(100000),
  connectors: z.array(z.object({ text: text(120), category: z.enum(CONNECTOR_CATEGORIES), language })).max(100000),
  jokes: z.array(z.object({ text: text(2000), type: z.enum(['joke', 'punchline']), language })).max(100000)
}).strict();

function counts(): LibraryTransferCounts {
  return { words: 0, expressions: 0, connectors: 0, jokes: 0 };
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().normalize('NFKC').replace(/\s+/g, ' ');
}

export class LibraryTransferService {
  constructor(private readonly db: Database.Database) {}

  public exportList(): LibraryTransferFile {
    return {
      format: 'studydock-library-list',
      version: 1,
      exportedAt: new Date().toISOString(),
      words: this.db.prepare('SELECT display_word AS text, language FROM vocab_words ORDER BY display_word COLLATE NOCASE').all() as LibraryTransferFile['words'],
      expressions: this.db.prepare('SELECT expression AS text, type, language FROM idioms_phrases_entries ORDER BY expression COLLATE NOCASE').all() as LibraryTransferFile['expressions'],
      connectors: this.db.prepare('SELECT connector AS text, category, language FROM connectors_entries ORDER BY connector COLLATE NOCASE').all() as LibraryTransferFile['connectors'],
      jokes: this.db.prepare('SELECT text, type, language FROM jokes_entries ORDER BY text COLLATE NOCASE').all() as LibraryTransferFile['jokes']
    };
  }

  public parse(content: string): LibraryTransferFile {
    if (Buffer.byteLength(content, 'utf8') > 10 * 1024 * 1024) throw new Error('This library file is too large (10 MB maximum).');
    let decoded: unknown;
    try { decoded = JSON.parse(content); } catch { throw new Error('This is not a valid JSON library file.'); }
    const parsed = fileSchema.safeParse(decoded);
    if (!parsed.success) throw new Error('This file is not a supported StudyDock library list.');
    return parsed.data;
  }

  public importList(file: LibraryTransferFile): LibraryImportResult {
    // Revalidate at the write boundary, including when called outside the file picker.
    const validated = fileSchema.parse(file);
    const imported = counts();
    const skipped = counts();
    const now = new Date().toISOString();
    const insertWord = this.db.prepare('INSERT OR IGNORE INTO vocab_words (id, display_word, normalized_word, language, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    const insertExpression = this.db.prepare('INSERT OR IGNORE INTO idioms_phrases_entries (id, expression, normalized_expression, type, language, meaning, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const insertConnector = this.db.prepare('INSERT OR IGNORE INTO connectors_entries (id, connector, normalized_connector, category, language, meaning, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const insertJoke = this.db.prepare('INSERT OR IGNORE INTO jokes_entries (id, text, normalized_text, type, language, explanation, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    this.db.transaction(() => {
      for (const item of validated.words) {
        const result = insertWord.run(`word_${randomUUID()}`, item.text, normalize(item.text), item.language.toLowerCase(), now, now);
        (result.changes ? imported : skipped).words++;
      }
      for (const item of validated.expressions) {
        const result = insertExpression.run(`expression_${randomUUID()}`, item.text, normalize(item.text), item.type, item.language.toLowerCase(), '', now, now);
        (result.changes ? imported : skipped).expressions++;
      }
      for (const item of validated.connectors) {
        const result = insertConnector.run(`connector_${randomUUID()}`, item.text, normalize(item.text), item.category, item.language.toLowerCase(), '', now, now);
        (result.changes ? imported : skipped).connectors++;
      }
      for (const item of validated.jokes) {
        const result = insertJoke.run(`joke_${randomUUID()}`, item.text, normalize(item.text), item.type, item.language.toLowerCase(), '', now, now);
        (result.changes ? imported : skipped).jokes++;
      }
    })();
    return { imported, skipped };
  }
}
