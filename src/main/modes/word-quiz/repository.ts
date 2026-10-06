import Database from 'better-sqlite3';
import { VocabDefinition, VocabWord } from '../../../shared/contracts/vocab';

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
    return this.db.prepare(`
      SELECT id, word_id AS wordId, part_of_speech AS partOfSpeech, definition, example,
             source, model_identifier AS modelIdentifier, prompt_version AS promptVersion,
             generated_at AS generatedAt, updated_at AS updatedAt
      FROM vocab_definitions
      WHERE word_id = ?
      ORDER BY id ASC
    `).all(wordId) as VocabDefinition[];
  }
}
