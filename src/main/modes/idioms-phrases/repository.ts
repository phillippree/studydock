import Database from 'better-sqlite3';
import { ExampleVoice, ExpressionType, IdiomPhraseEntry, IdiomPhraseExample, IdiomPhraseListPage, IdiomPhraseListQuery, IdiomPhraseQuizPrompt } from '../../../shared/contracts/idiomsPhrases';

export class IdiomsPhrasesRepository {
  constructor(private readonly db: Database.Database) {}

  public list(query: Required<Pick<IdiomPhraseListQuery, 'offset' | 'limit'>> & Omit<IdiomPhraseListQuery, 'offset' | 'limit'>): IdiomPhraseListPage {
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (query.type) {
      conditions.push('type = ?');
      params.push(query.type);
    }
    const search = query.search?.trim().toLocaleLowerCase() || '';
    if (search) {
      conditions.push('(instr(lower(expression), ?) > 0 OR instr(lower(meaning), ?) > 0)');
      params.push(search, search);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalRow = this.db.prepare(`SELECT COUNT(*) AS total FROM idioms_phrases_entries ${where}`).get(...params) as { total: number };
    const rows = this.db.prepare(`
      SELECT id, expression, normalized_expression AS normalizedExpression, type, language, meaning,
             created_at AS createdAt, updated_at AS updatedAt
      FROM idioms_phrases_entries ${where}
      ORDER BY expression COLLATE NOCASE
      LIMIT ? OFFSET ?
    `).all(...params, query.limit, query.offset) as Array<Omit<IdiomPhraseEntry, 'examples'>>;
    if (rows.length === 0) return { entries: [], total: totalRow.total };

    const examples = this.db.prepare(`
      SELECT id, entry_id AS entryId, example, voice, position
      FROM idioms_phrases_examples
      WHERE entry_id IN (${rows.map(() => '?').join(', ')})
      ORDER BY entry_id, position
    `).all(...rows.map(row => row.id)) as Array<IdiomPhraseExample & { entryId: string }>;
    const grouped = new Map<string, IdiomPhraseExample[]>();
    for (const item of examples) {
      const { entryId, ...example } = item;
      const bucket = grouped.get(entryId) || [];
      bucket.push(example);
      grouped.set(entryId, bucket);
    }
    return {
      entries: rows.map(row => ({ ...row, type: row.type as ExpressionType, examples: grouped.get(row.id) || [] })),
      total: totalRow.total
    };
  }

  public find(normalizedExpression: string, type: ExpressionType, language: string): IdiomPhraseEntry | null {
    const row = this.db.prepare(`
      SELECT id, expression, normalized_expression AS normalizedExpression, type, language, meaning,
             created_at AS createdAt, updated_at AS updatedAt
      FROM idioms_phrases_entries WHERE normalized_expression = ? AND type = ? AND language = ?
    `).get(normalizedExpression, type, language) as Omit<IdiomPhraseEntry, 'examples'> | undefined;
    if (!row) return null;
    const examples = this.db.prepare(`
      SELECT id, example, voice, position FROM idioms_phrases_examples WHERE entry_id = ? ORDER BY position
    `).all(row.id) as IdiomPhraseExample[];
    return { ...row, type: row.type as ExpressionType, examples };
  }

  public getById(id: string): IdiomPhraseEntry | null {
    const row = this.db.prepare(`
      SELECT id, expression, normalized_expression AS normalizedExpression, type, language, meaning,
             created_at AS createdAt, updated_at AS updatedAt
      FROM idioms_phrases_entries WHERE id = ?
    `).get(id) as Omit<IdiomPhraseEntry, 'examples'> | undefined;
    if (!row) return null;
    const examples = this.db.prepare(`
      SELECT id, example, voice, position FROM idioms_phrases_examples WHERE entry_id = ? ORDER BY position
    `).all(id) as IdiomPhraseExample[];
    return { ...row, type: row.type as ExpressionType, examples };
  }

  public replaceExamples(id: string, examples: Array<{ example: string; voice: ExampleVoice }>): IdiomPhraseEntry | null {
    const replaceTransaction = this.db.transaction(() => {
      const exists = this.db.prepare('SELECT 1 FROM idioms_phrases_entries WHERE id = ?').get(id);
      if (!exists) return false;

      this.db.prepare('DELETE FROM idioms_phrases_examples WHERE entry_id = ?').run(id);
      const insertExample = this.db.prepare(`
        INSERT INTO idioms_phrases_examples (id, entry_id, example, position, voice) VALUES (?, ?, ?, ?, ?)
      `);
      examples.forEach((item, index) => insertExample.run(`${id}_example_${Date.now()}_${index + 1}`, id, item.example, index + 1, item.voice));
      this.db.prepare('UPDATE idioms_phrases_entries SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
      return true;
    });

    if (!replaceTransaction()) return null;
    return this.getById(id);
  }

  public getRandomQuizPrompt(type?: ExpressionType, excludeId?: string): IdiomPhraseQuizPrompt | null {
    const row = this.db.prepare(`
      SELECT id, expression, type, language
      FROM idioms_phrases_entries
      WHERE (? IS NULL OR type = ?)
        AND (? IS NULL OR id != ?)
      ORDER BY RANDOM()
      LIMIT 1
    `).get(type ?? null, type ?? null, excludeId ?? null, excludeId ?? null) as IdiomPhraseQuizPrompt | undefined;
    if (row) return row;
    if (excludeId) return this.getRandomQuizPrompt(type);
    return null;
  }

  public save(input: {
    expression: string;
    normalizedExpression: string;
    type: ExpressionType;
    language: string;
    meaning: string;
    examples: Array<string | { example: string; voice?: ExampleVoice }>;
  }): IdiomPhraseEntry {
    const id = `expression_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    const saveTransaction = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO idioms_phrases_entries (id, expression, normalized_expression, type, language, meaning, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, input.expression, input.normalizedExpression, input.type, input.language, input.meaning, now, now);
      const insertExample = this.db.prepare(`
        INSERT INTO idioms_phrases_examples (id, entry_id, example, position, voice) VALUES (?, ?, ?, ?, ?)
      `);
      input.examples.forEach((item, index) => {
        const example = typeof item === 'string' ? item : item.example;
        const voice = typeof item === 'string' ? 'other' : item.voice || 'other';
        insertExample.run(`${id}_example_${index + 1}`, id, example, index + 1, voice);
      });
    });
    saveTransaction();
    return {
      id,
      expression: input.expression,
      normalizedExpression: input.normalizedExpression,
      type: input.type,
      language: input.language,
      meaning: input.meaning,
      examples: input.examples.map((item, index) => ({
        id: `${id}_example_${index + 1}`,
        example: typeof item === 'string' ? item : item.example,
        voice: typeof item === 'string' ? 'other' : item.voice || 'other',
        position: index + 1
      })),
      createdAt: now,
      updatedAt: now
    };
  }
}
