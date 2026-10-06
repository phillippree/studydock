import Database from 'better-sqlite3';
import { ExpressionType, IdiomPhraseEntry, IdiomPhraseExample } from '../../../shared/contracts/idiomsPhrases';

export class IdiomsPhrasesRepository {
  constructor(private readonly db: Database.Database) {}

  public list(type?: ExpressionType): IdiomPhraseEntry[] {
    const rows = (type
      ? this.db.prepare(`SELECT id, expression, normalized_expression AS normalizedExpression, type, language, meaning, created_at AS createdAt, updated_at AS updatedAt FROM idioms_phrases_entries WHERE type = ? ORDER BY expression COLLATE NOCASE`).all(type)
      : this.db.prepare(`SELECT id, expression, normalized_expression AS normalizedExpression, type, language, meaning, created_at AS createdAt, updated_at AS updatedAt FROM idioms_phrases_entries ORDER BY expression COLLATE NOCASE`).all()) as Array<Omit<IdiomPhraseEntry, 'examples'>>;
    if (rows.length === 0) return [];

    const examples = this.db.prepare(`
      SELECT id, entry_id AS entryId, example, position
      FROM idioms_phrases_examples
      ORDER BY entry_id, position
    `).all() as Array<IdiomPhraseExample & { entryId: string }>;
    const grouped = new Map<string, IdiomPhraseExample[]>();
    for (const item of examples) {
      const { entryId, ...example } = item;
      const bucket = grouped.get(entryId) || [];
      bucket.push(example);
      grouped.set(entryId, bucket);
    }
    return rows.map(row => ({ ...row, type: row.type as ExpressionType, examples: grouped.get(row.id) || [] }));
  }

  public find(normalizedExpression: string, type: ExpressionType, language: string): IdiomPhraseEntry | null {
    const row = this.db.prepare(`
      SELECT id, expression, normalized_expression AS normalizedExpression, type, language, meaning,
             created_at AS createdAt, updated_at AS updatedAt
      FROM idioms_phrases_entries WHERE normalized_expression = ? AND type = ? AND language = ?
    `).get(normalizedExpression, type, language) as Omit<IdiomPhraseEntry, 'examples'> | undefined;
    if (!row) return null;
    const examples = this.db.prepare(`
      SELECT id, example, position FROM idioms_phrases_examples WHERE entry_id = ? ORDER BY position
    `).all(row.id) as IdiomPhraseExample[];
    return { ...row, type: row.type as ExpressionType, examples };
  }

  public save(input: {
    expression: string;
    normalizedExpression: string;
    type: ExpressionType;
    language: string;
    meaning: string;
    examples: string[];
  }): IdiomPhraseEntry {
    const id = `expression_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    const saveTransaction = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO idioms_phrases_entries (id, expression, normalized_expression, type, language, meaning, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, input.expression, input.normalizedExpression, input.type, input.language, input.meaning, now, now);
      const insertExample = this.db.prepare(`
        INSERT INTO idioms_phrases_examples (id, entry_id, example, position) VALUES (?, ?, ?, ?)
      `);
      input.examples.forEach((example, index) => insertExample.run(`${id}_example_${index + 1}`, id, example, index + 1));
    });
    saveTransaction();
    return {
      id,
      expression: input.expression,
      normalizedExpression: input.normalizedExpression,
      type: input.type,
      language: input.language,
      meaning: input.meaning,
      examples: input.examples.map((example, index) => ({ id: `${id}_example_${index + 1}`, example, position: index + 1 })),
      createdAt: now,
      updatedAt: now
    };
  }
}
