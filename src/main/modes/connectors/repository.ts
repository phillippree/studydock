import Database from 'better-sqlite3';
import { ConnectorCategory, ConnectorEntry, ConnectorExample, ConnectorListPage, ConnectorListQuery, ConnectorVoice } from '../../../shared/contracts/connectors';

export class ConnectorsRepository {
  constructor(private readonly db: Database.Database) {}

  public list(query: Required<Pick<ConnectorListQuery, 'offset' | 'limit'>> & Omit<ConnectorListQuery, 'offset' | 'limit'>): ConnectorListPage {
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (query.category) { conditions.push('category = ?'); params.push(query.category); }
    const search = query.search?.trim().toLocaleLowerCase() || '';
    if (search) { conditions.push('(instr(lower(connector), ?) > 0 OR instr(lower(meaning), ?) > 0)'); params.push(search, search); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT COUNT(*) AS total FROM connectors_entries ${where}`).get(...params) as { total: number };
    const rows = this.db.prepare(`
      SELECT id, connector, normalized_connector AS normalizedConnector, category, language, meaning,
             created_at AS createdAt, updated_at AS updatedAt
      FROM connectors_entries ${where} ORDER BY connector COLLATE NOCASE LIMIT ? OFFSET ?
    `).all(...params, query.limit, query.offset) as Array<Omit<ConnectorEntry, 'examples'>>;
    if (!rows.length) return { entries: [], total: total.total };
    const examples = this.db.prepare(`
      SELECT id, entry_id AS entryId, example, voice, position FROM connectors_examples
      WHERE entry_id IN (${rows.map(() => '?').join(', ')}) ORDER BY entry_id, position
    `).all(...rows.map(row => row.id)) as Array<ConnectorExample & { entryId: string }>;
    const grouped = new Map<string, ConnectorExample[]>();
    for (const { entryId, ...example } of examples) grouped.set(entryId, [...(grouped.get(entryId) || []), example]);
    return { entries: rows.map(row => ({ ...row, category: row.category as ConnectorCategory, examples: grouped.get(row.id) || [] })), total: total.total };
  }

  public find(normalizedConnector: string, language: string): ConnectorEntry | null {
    const row = this.db.prepare(`
      SELECT id, connector, normalized_connector AS normalizedConnector, category, language, meaning,
             created_at AS createdAt, updated_at AS updatedAt FROM connectors_entries
      WHERE normalized_connector = ? AND language = ?
    `).get(normalizedConnector, language) as Omit<ConnectorEntry, 'examples'> | undefined;
    return row ? { ...row, category: row.category as ConnectorCategory, examples: this.getExamples(row.id) } : null;
  }

  public getById(id: string): ConnectorEntry | null {
    const row = this.db.prepare(`
      SELECT id, connector, normalized_connector AS normalizedConnector, category, language, meaning,
             created_at AS createdAt, updated_at AS updatedAt FROM connectors_entries WHERE id = ?
    `).get(id) as Omit<ConnectorEntry, 'examples'> | undefined;
    return row ? { ...row, category: row.category as ConnectorCategory, examples: this.getExamples(id) } : null;
  }

  public save(input: { connector: string; normalizedConnector: string; category: ConnectorCategory; language: string; meaning: string; examples: Array<{ example: string; voice: ConnectorVoice }> }): ConnectorEntry {
    const id = `connector_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    const saveTransaction = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO connectors_entries (id, connector, normalized_connector, category, language, meaning, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.connector, input.normalizedConnector, input.category, input.language, input.meaning, now, now);
      const insert = this.db.prepare('INSERT INTO connectors_examples (id, entry_id, example, position, voice) VALUES (?, ?, ?, ?, ?)');
      input.examples.forEach((item, index) => insert.run(`${id}_example_${index + 1}`, id, item.example, index + 1, item.voice));
    });
    saveTransaction();
    return this.getById(id)!;
  }

  public replaceExamples(id: string, examples: Array<{ example: string; voice: ConnectorVoice }>): ConnectorEntry | null {
    const replace = this.db.transaction(() => {
      if (!this.db.prepare('SELECT 1 FROM connectors_entries WHERE id = ?').get(id)) return false;
      this.db.prepare('DELETE FROM connectors_examples WHERE entry_id = ?').run(id);
      const insert = this.db.prepare('INSERT INTO connectors_examples (id, entry_id, example, position, voice) VALUES (?, ?, ?, ?, ?)');
      examples.forEach((item, index) => insert.run(`${id}_example_${Date.now()}_${index + 1}`, id, item.example, index + 1, item.voice));
      this.db.prepare('UPDATE connectors_entries SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
      return true;
    });
    return replace() ? this.getById(id) : null;
  }

  private getExamples(id: string): ConnectorExample[] {
    return this.db.prepare('SELECT id, example, voice, position FROM connectors_examples WHERE entry_id = ? ORDER BY position').all(id) as ConnectorExample[];
  }
}
