import { Database } from 'better-sqlite3';
import {
  PartOfSpeech,
  VocabExample,
  VocabDefinition,
  VocabWord
} from '../../../shared/contracts/vocab';

export class VocabRepository {
  constructor(private db: Database) {}

  private hydrateDefinitions(rows: Array<Omit<VocabDefinition, 'examples'>>): VocabDefinition[] {
    if (rows.length === 0) return [];
    const examples = this.db.prepare(`
      SELECT id, definition_id AS definitionId, example, position, voice
      FROM vocab_definition_examples
      ORDER BY definition_id, position
    `).all() as Array<VocabExample & { definitionId: string }>;
    const grouped = new Map<string, VocabExample[]>();
    for (const item of examples) {
      const { definitionId, ...example } = item;
      const bucket = grouped.get(definitionId) || [];
      bucket.push(example);
      grouped.set(definitionId, bucket);
    }
    return rows.map(row => ({
      ...row,
      examples: grouped.get(row.id) || [{ example: row.example, position: 1, voice: 'other' }]
    }));
  }

  private insertExamples(definitionId: string, examples: VocabExample[]): void {
    const insert = this.db.prepare(`
      INSERT INTO vocab_definition_examples (id, definition_id, example, position, voice)
      VALUES (?, ?, ?, ?, ?)
    `);
    examples.forEach((item, index) => {
      insert.run(item.id || `example_${definitionId}_${index + 1}`, definitionId, item.example, index + 1, item.voice || 'other');
    });
  }

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

  public createWordWithDefinitions(
    displayWord: string,
    normalizedWord: string,
    language: string,
    definitions: Array<{
      partOfSpeech: string;
      definition: string;
      examples: Array<{ example: string; voice: VocabExample['voice'] }>;
      source: string;
      modelIdentifier?: string;
      promptVersion?: number;
    }>
  ): { word: VocabWord; definitions: VocabDefinition[] } {
    const now = new Date().toISOString();
    const wordId = `word_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const savedDefinitions: VocabDefinition[] = [];
    const save = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO vocab_words (id, display_word, normalized_word, language, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(wordId, displayWord, normalizedWord, language, now, now);

      const insertDefinition = this.db.prepare(`
        INSERT INTO vocab_definitions (
          id, word_id, part_of_speech, definition, example, source, model_identifier, prompt_version, generated_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      definitions.forEach((item, index) => {
        const definitionId = `def_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 7)}`;
        const examples = item.examples.map((example, exampleIndex) => ({ ...example, position: exampleIndex + 1 }));
        insertDefinition.run(
          definitionId,
          wordId,
          item.partOfSpeech,
          item.definition,
          examples[0].example,
          item.source,
          item.modelIdentifier || null,
          item.promptVersion || 1,
          now,
          now
        );
        this.insertExamples(definitionId, examples);
        savedDefinitions.push({
          id: definitionId,
          wordId,
          partOfSpeech: item.partOfSpeech as PartOfSpeech,
          definition: item.definition,
          example: examples[0].example,
          examples,
          source: item.source as VocabDefinition['source'],
          modelIdentifier: item.modelIdentifier,
          promptVersion: item.promptVersion || 1,
          generatedAt: now,
          updatedAt: now
        });
      });
    });
    save();

    return {
      word: { id: wordId, displayWord, normalizedWord, language, createdAt: now, updatedAt: now },
      definitions: savedDefinitions
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
    `).all(wordId) as Array<Omit<VocabDefinition, 'examples'>>;

    return this.hydrateDefinitions(rows);
  }

  public replaceDefinitions(
    wordId: string,
    definitions: Array<{
      partOfSpeech: string;
      definition: string;
      example: string;
      examples?: VocabExample[];
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
        const itemExamples = item.examples?.length
          ? item.examples
          : [{ example: item.example, position: 1, voice: 'other' as const }];
        insert.run(
          defId,
          wordId,
          item.partOfSpeech,
          item.definition,
          itemExamples[0].example,
          item.source,
          item.modelIdentifier || null,
          item.promptVersion || 1,
          now,
          now
        );
        this.insertExamples(defId, itemExamples);

        result.push({
          id: defId,
          wordId,
          partOfSpeech: item.partOfSpeech as PartOfSpeech,
          definition: item.definition,
          example: itemExamples[0].example,
          examples: itemExamples.map((example, index) => ({ ...example, position: index + 1 })),
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
    source = 'manual',
    examples?: VocabExample[]
  ): VocabDefinition {
    const now = new Date().toISOString();
    const id = `def_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const itemExamples = examples?.length ? examples : [{ example, position: 1, voice: 'other' as const }];
    const save = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO vocab_definitions (
          id, word_id, part_of_speech, definition, example, source, model_identifier, prompt_version, generated_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)
      `).run(id, wordId, partOfSpeech, definition, itemExamples[0].example, source, now, now);
      this.insertExamples(id, itemExamples);
    });
    save();

    return {
      id,
      wordId,
      partOfSpeech: partOfSpeech as PartOfSpeech,
      definition,
      example: itemExamples[0].example,
      examples: itemExamples,
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
    `).get(id) as Omit<VocabDefinition, 'examples'> | undefined;

    if (!existing) return null;

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE vocab_definitions
      SET part_of_speech = ?, definition = ?, example = ?, updated_at = ?
      WHERE id = ?
    `).run(partOfSpeech, definition, example, now, id);

    this.db.prepare(`
      UPDATE vocab_definition_examples
      SET example = ?, voice = 'other'
      WHERE definition_id = ? AND position = 1
    `).run(example, id);

    const examples = this.db.prepare(`
      SELECT id, example, position, voice
      FROM vocab_definition_examples WHERE definition_id = ? ORDER BY position
    `).all(id) as VocabExample[];

    return {
      ...existing,
      partOfSpeech: partOfSpeech as PartOfSpeech,
      definition,
      example,
      examples,
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

    const rawDefRows = this.db.prepare(`
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
    `).all() as Array<Omit<VocabDefinition, 'examples'>>;
    const defRows = this.hydrateDefinitions(rawDefRows);

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
