import Database from 'better-sqlite3';
import { JokeEntry, JokeExample, JokeExampleVoice, JokeListPage, JokeListQuery, JokeType } from '../../../shared/contracts/jokes';

type JokeRow = Omit<JokeEntry, 'examples'>;

export class JokesRepository {
  constructor(private readonly db: Database.Database) {}

  public list(query: Required<Pick<JokeListQuery, 'offset' | 'limit'>> & Omit<JokeListQuery, 'offset' | 'limit'>): JokeListPage {
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (query.type) { conditions.push('type = ?'); params.push(query.type); }
    const search = query.search?.trim().toLocaleLowerCase() || '';
    if (search) { conditions.push('(instr(lower(text), ?) > 0 OR instr(lower(explanation), ?) > 0)'); params.push(search, search); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT COUNT(*) AS total FROM jokes_entries ${where}`).get(...params) as { total: number };
    const entries = this.db.prepare(`
      SELECT id, text, normalized_text AS normalizedText, type, language, explanation,
             created_at AS createdAt, updated_at AS updatedAt
      FROM jokes_entries ${where} ORDER BY created_at DESC, text COLLATE NOCASE LIMIT ? OFFSET ?
    `).all(...params, query.limit, query.offset) as JokeRow[];
    if (!entries.length) return { entries: [], total: total.total };
    const examples = this.getExamples(entries.map(entry => entry.id));
    const grouped = new Map<string, JokeExample[]>();
    for (const { entryId, ...example } of examples) grouped.set(entryId, [...(grouped.get(entryId) || []), example]);
    return { entries: entries.map(entry => ({ ...entry, type: entry.type as JokeType, examples: grouped.get(entry.id) || [] })), total: total.total };
  }

  public find(normalizedText: string, type: JokeType, language: string): JokeEntry | null {
    const row = this.db.prepare(`
      SELECT id, text, normalized_text AS normalizedText, type, language, explanation,
             created_at AS createdAt, updated_at AS updatedAt
      FROM jokes_entries WHERE normalized_text = ? AND type = ? AND language = ?
    `).get(normalizedText, type, language) as JokeRow | undefined;
    return row ? { ...row, type: row.type as JokeType, examples: this.getExamples([row.id]).map(({ entryId: _entryId, ...item }) => item) } : null;
  }

  public getById(id: string): JokeEntry | null {
    const row = this.db.prepare(`
      SELECT id, text, normalized_text AS normalizedText, type, language, explanation,
             created_at AS createdAt, updated_at AS updatedAt
      FROM jokes_entries WHERE id = ?
    `).get(id) as JokeRow | undefined;
    return row ? { ...row, type: row.type as JokeType, examples: this.getExamples([id]).map(({ entryId: _entryId, ...item }) => item) } : null;
  }

  public save(input: { text: string; normalizedText: string; type: JokeType; language: string; explanation: string; examples: Array<{ example: string; voice: JokeExampleVoice }> }): JokeEntry {
    const id = `joke_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    const saveTransaction = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO jokes_entries (id, text, normalized_text, type, language, explanation, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.text, input.normalizedText, input.type, input.language, input.explanation, now, now);
      const insertExample = this.db.prepare('INSERT INTO jokes_examples (id, entry_id, example, voice, position) VALUES (?, ?, ?, ?, ?)');
      input.examples.forEach((item, index) => insertExample.run(`${id}_example_${index + 1}`, id, item.example, item.voice, index + 1));
    });
    saveTransaction();
    return this.getById(id)!;
  }

  private getExamples(entryIds: string[]): Array<JokeExample & { entryId: string }> {
    if (!entryIds.length) return [];
    return this.db.prepare(`SELECT id, entry_id AS entryId, example, voice, position FROM jokes_examples
      WHERE entry_id IN (${entryIds.map(() => '?').join(', ')}) ORDER BY entry_id, position`).all(...entryIds) as Array<JokeExample & { entryId: string }>;
  }
}
