import Database from 'better-sqlite3';
import { VocabDefinition, VocabExample, VocabWord } from '../../../shared/contracts/vocab';

export class WordQuizRepository {
  constructor(private readonly db: Database.Database) {}

  public getRandomWord(excludeWordId?: string): VocabWord | null {
    const row = this.db.prepare(`
      SELECT w.id, w.display_word AS displayWord, w.normalized_word AS normalizedWord,
             w.language, w.created_at AS createdAt, w.updated_at AS updatedAt
      FROM vocab_words w
      WHERE EXISTS (SELECT 1 FROM vocab_definitions d WHERE d.word_id = w.id)
        AND (? IS NULL OR w.id != ?)
      ORDER BY RANDOM()
      LIMIT 1
    `).get(excludeWordId ?? null, excludeWordId ?? null) as VocabWord | undefined;

    if (row || !excludeWordId) return row ?? null;
    return this.getRandomWord();
  }

  public getDefinitions(wordId: string): VocabDefinition[] {
    const definitions = this.db.prepare(`
      SELECT id, word_id AS wordId, part_of_speech AS partOfSpeech, definition, example,
             source, model_identifier AS modelIdentifier, prompt_version AS promptVersion,
             generated_at AS generatedAt, updated_at AS updatedAt
      FROM vocab_definitions
      WHERE word_id = ?
      ORDER BY id ASC
    `).all(wordId) as Array<Omit<VocabDefinition, 'examples'>>;
    if (!definitions.length) return [];

    const examples = this.db.prepare(`
      SELECT id, definition_id AS definitionId, example, position, voice
      FROM vocab_definition_examples
      WHERE definition_id IN (SELECT id FROM vocab_definitions WHERE word_id = ?)
      ORDER BY definition_id, position
    `).all(wordId) as Array<VocabExample & { definitionId: string }>;
    const byDefinition = new Map<string, VocabExample[]>();
    for (const item of examples) {
      const { definitionId, ...example } = item;
      const grouped = byDefinition.get(definitionId) || [];
      grouped.push(example);
      byDefinition.set(definitionId, grouped);
    }
    return definitions.map(definition => ({
      ...definition,
      examples: byDefinition.get(definition.id) || [{ example: definition.example, position: 1, voice: 'other' }]
    }));
  }

  public getWord(wordId: string): VocabWord | null {
    const row = this.db.prepare(`
      SELECT w.id, w.display_word AS displayWord, w.normalized_word AS normalizedWord,
             w.language, w.created_at AS createdAt, w.updated_at AS updatedAt
      FROM vocab_words w
      WHERE w.id = ?
        AND EXISTS (SELECT 1 FROM vocab_definitions d WHERE d.word_id = w.id)
    `).get(wordId) as VocabWord | undefined;
    return row ?? null;
  }
}
