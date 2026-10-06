import { Database } from 'better-sqlite3';
import {
  PartOfSpeech,
  VocabDefinition,
  VocabWord
} from '../../../shared/contracts/vocab';

export class VocabRepository {
  constructor(private db: Database) {}

  public getWordsCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM vocab_words').get() as { count: number };
    return row.count;
  }

  public findWordById(id: string): VocabWord | null {
    const row = this.db.prepare(`
      SELECT id, display_word as displayWord, normalized_word as normalizedWord, language, created_at as createdAt, updated_at as updatedAt
      FROM vocab_words
      WHERE id = ?
    `).get(id) as VocabWord | undefined;

    return row || null;
  }

  public findWordByNormalized(normalizedWord: string, language = 'en'): VocabWord | null {
    const row = this.db.prepare(`
      SELECT id, display_word as displayWord, normalized_word as normalizedWord, language, created_at as createdAt, updated_at as updatedAt
      FROM vocab_words
      WHERE normalized_word = ? AND language = ?
    `).get(normalizedWord, language) as VocabWord | undefined;

    return row || null;
  }

  public getAllWords(): Array<VocabWord & { definitionCount: number }> {
    const rows = this.db.prepare(`
      SELECT
        w.id,
        w.display_word as displayWord,
        w.normalized_word as normalizedWord,
        w.language,
        w.created_at as createdAt,
        w.updated_at as updatedAt,
        COUNT(d.id) as definitionCount
      FROM vocab_words w
      LEFT JOIN vocab_definitions d ON w.id = d.word_id
      GROUP BY w.id
      ORDER BY w.display_word COLLATE NOCASE ASC
    `).all() as Array<VocabWord & { definitionCount: number }>;

    return rows;
  }

  public getRandomWord(excludeWordId?: string): VocabWord | null {
    const count = this.getWordsCount();
    if (count === 0) return null;

    if (count === 1) {
      const single = this.db.prepare(`
        SELECT id, display_word as displayWord, normalized_word as normalizedWord, language, created_at as createdAt, updated_at as updatedAt
        FROM vocab_words
        LIMIT 1
      `).get() as VocabWord | undefined;
      return single || null;
    }

    if (excludeWordId) {
      const row = this.db.prepare(`
        SELECT id, display_word as displayWord, normalized_word as normalizedWord, language, created_at as createdAt, updated_at as updatedAt
        FROM vocab_words
        WHERE id != ?
        ORDER BY RANDOM()
        LIMIT 1
      `).get(excludeWordId) as VocabWord | undefined;
      if (row) return row;
    }

    const row = this.db.prepare(`
      SELECT id, display_word as displayWord, normalized_word as normalizedWord, language, created_at as createdAt, updated_at as updatedAt
      FROM vocab_words
      ORDER BY RANDOM()
      LIMIT 1
    `).get() as VocabWord | undefined;

    return row || null;
  }

  public createWord(displayWord: string, normalizedWord: string, language = 'en'): VocabWord {
    const id = `word_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO vocab_words (id, display_word, normalized_word, language, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, displayWord, normalizedWord, language, now, now);

    return {
      id,
      displayWord,
      normalizedWord,
      language,
      createdAt: now,
      updatedAt: now
    };
  }

  public updateWord(
    id: string,
    displayWord: string,
    normalizedWord: string,
    language = 'en'
  ): { word: VocabWord; normalizedChanged: boolean } {
    const existing = this.findWordById(id);
    if (!existing) {
      throw new Error(`Word with ID "${id}" not found.`);
    }

    const normalizedChanged = existing.normalizedWord !== normalizedWord || existing.language !== language;
    const now = new Date().toISOString();

    const runTransaction = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE vocab_words
        SET display_word = ?, normalized_word = ?, language = ?, updated_at = ?
        WHERE id = ?
      `).run(displayWord, normalizedWord, language, now, id);

      // If the word's lexical identity changed, clear the previous definitions
      if (normalizedChanged) {
        this.db.prepare('DELETE FROM vocab_definitions WHERE word_id = ?').run(id);
      }
    });

    runTransaction();

    return {
      word: {
        id,
        displayWord,
        normalizedWord,
        language,
        createdAt: existing.createdAt,
        updatedAt: now
      },
      normalizedChanged
    };
  }

  public deleteWord(id: string): VocabWord | null {
    const existing = this.findWordById(id);
    if (!existing) return null;

    this.db.prepare('DELETE FROM vocab_words WHERE id = ?').run(id);
    return existing;
  }

  public getDefinitionsForWord(wordId: string): VocabDefinition[] {
    const rows = this.db.prepare(`
      SELECT
        id,
        word_id as wordId,
        part_of_speech as partOfSpeech,
        definition,
        example,
        source,
        model_identifier as modelIdentifier,
        prompt_version as promptVersion,
        generated_at as generatedAt,
        updated_at as updatedAt
      FROM vocab_definitions
      WHERE word_id = ?
      ORDER BY id ASC
    `).all(wordId) as VocabDefinition[];

    return rows;
  }

  public replaceDefinitions(
    wordId: string,
    definitions: Array<{
      partOfSpeech: string;
      definition: string;
      example: string;
      source: string;
      modelIdentifier?: string;
      promptVersion?: number;
    }>
  ): VocabDefinition[] {
    const now = new Date().toISOString();
    const result: VocabDefinition[] = [];

    const runTransaction = this.db.transaction(() => {
      // Clear existing
      this.db.prepare('DELETE FROM vocab_definitions WHERE word_id = ?').run(wordId);

      const insert = this.db.prepare(`
        INSERT INTO vocab_definitions (
          id, word_id, part_of_speech, definition, example, source, model_identifier, prompt_version, generated_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < definitions.length; i++) {
        const item = definitions[i];
        const defId = `def_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`;
        insert.run(
          defId,
          wordId,
          item.partOfSpeech,
          item.definition,
          item.example,
          item.source,
          item.modelIdentifier || null,
          item.promptVersion || 1,
          now,
          now
        );

        result.push({
          id: defId,
          wordId,
          partOfSpeech: item.partOfSpeech as PartOfSpeech,
          definition: item.definition,
          example: item.example,
          source: item.source as VocabDefinition['source'],
          modelIdentifier: item.modelIdentifier,
          promptVersion: item.promptVersion || 1,
          generatedAt: now,
          updatedAt: now
        });
      }
    });

    runTransaction();
    return result;
  }

  public addDefinition(
    wordId: string,
    partOfSpeech: string,
    definition: string,
    example: string,
    source = 'manual'
  ): VocabDefinition {
    const now = new Date().toISOString();
    const id = `def_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    this.db.prepare(`
      INSERT INTO vocab_definitions (
        id, word_id, part_of_speech, definition, example, source, model_identifier, prompt_version, generated_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)
    `).run(id, wordId, partOfSpeech, definition, example, source, now, now);

    return {
      id,
      wordId,
      partOfSpeech: partOfSpeech as PartOfSpeech,
      definition,
      example,
      source: source as VocabDefinition['source'],
      generatedAt: now,
      updatedAt: now
    };
  }

  public updateDefinition(
    id: string,
    partOfSpeech: string,
    definition: string,
    example: string
  ): VocabDefinition | null {
    const existing = this.db.prepare(`
      SELECT id, word_id as wordId, part_of_speech as partOfSpeech, definition, example, source, model_identifier as modelIdentifier, prompt_version as promptVersion, generated_at as generatedAt, updated_at as updatedAt
      FROM vocab_definitions
      WHERE id = ?
    `).get(id) as VocabDefinition | undefined;

    if (!existing) return null;

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE vocab_definitions
      SET part_of_speech = ?, definition = ?, example = ?, updated_at = ?
      WHERE id = ?
    `).run(partOfSpeech, definition, example, now, id);

    return {
      ...existing,
      partOfSpeech: partOfSpeech as PartOfSpeech,
      definition,
      example,
      updatedAt: now
    };
  }

  public deleteDefinition(id: string): boolean {
    const info = this.db.prepare('DELETE FROM vocab_definitions WHERE id = ?').run(id);
    return info.changes > 0;
  }

  public getAllWordsWithDefinitions(): Array<VocabWord & { definitions: VocabDefinition[] }> {
    const words = this.db.prepare(`
      SELECT id, display_word as displayWord, normalized_word as normalizedWord, language, created_at as createdAt, updated_at as updatedAt
      FROM vocab_words
      ORDER BY display_word COLLATE NOCASE ASC
    `).all() as VocabWord[];

    const defRows = this.db.prepare(`
      SELECT
        id,
        word_id as wordId,
        part_of_speech as partOfSpeech,
        definition,
        example,
        source,
        model_identifier as modelIdentifier,
        prompt_version as promptVersion,
        generated_at as generatedAt,
        updated_at as updatedAt
      FROM vocab_definitions
      ORDER BY id ASC
    `).all() as VocabDefinition[];

    const defMap = new Map<string, VocabDefinition[]>();
    for (const def of defRows) {
      if (!defMap.has(def.wordId)) {
        defMap.set(def.wordId, []);
      }
      defMap.get(def.wordId)!.push(def);
    }

    return words.map(w => ({
      ...w,
      definitions: defMap.get(w.id) || []
    }));
  }
}
