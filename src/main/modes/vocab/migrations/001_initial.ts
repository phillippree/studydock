import { Database } from 'better-sqlite3';
import { Migration } from '../../../database/migrations';

const STARTER_WORDS = [
  {
    word: 'lucid',
    definitions: [
      {
        partOfSpeech: 'adjective',
        definition: 'Expressed clearly; easy to understand.',
        example: 'She gave a lucid explanation of the complex quantum theory.'
      },
      {
        partOfSpeech: 'adjective',
        definition: 'Showing ability to think clearly, especially between periods of confusion.',
        example: 'The patient had a few lucid moments during the morning.'
      }
    ]
  },
  {
    word: 'serendipity',
    definitions: [
      {
        partOfSpeech: 'noun',
        definition: 'The occurrence and development of events by chance in a happy or beneficial way.',
        example: 'Finding his favorite childhood book in the thrift shop was pure serendipity.'
      }
    ]
  },
  {
    word: 'resilient',
    definitions: [
      {
        partOfSpeech: 'adjective',
        definition: 'Able to withstand or recover quickly from difficult conditions.',
        example: 'The community showed resilient spirit in rebuilding after the storm.'
      }
    ]
  },
  {
    word: 'ephemeral',
    definitions: [
      {
        partOfSpeech: 'adjective',
        definition: 'Lasting for a very short time; transitory.',
        example: 'The beauty of spring cherry blossoms is famously ephemeral.'
      }
    ]
  },
  {
    word: 'pragmatic',
    definitions: [
      {
        partOfSpeech: 'adjective',
        definition: 'Dealing with things sensibly and realistically based on practical considerations.',
        example: 'They decided to take a pragmatic approach to the project deadlines.'
      }
    ]
  },
  {
    word: 'mellifluous',
    definitions: [
      {
        partOfSpeech: 'adjective',
        definition: 'Sweet or musical; pleasant and soothing to hear.',
        example: 'The narrator captivated the audience with her mellifluous voice.'
      }
    ]
  },
  {
    word: 'ubiquitous',
    definitions: [
      {
        partOfSpeech: 'adjective',
        definition: 'Present, appearing, or found everywhere simultaneously.',
        example: 'Smartphones have become ubiquitous across all age groups.'
      }
    ]
  },
  {
    word: 'eloquent',
    definitions: [
      {
        partOfSpeech: 'adjective',
        definition: 'Fluent, graceful, or persuasive in speaking or writing.',
        example: 'He gave an eloquent speech that moved the entire audience.'
      }
    ]
  },
  {
    word: 'tenacious',
    definitions: [
      {
        partOfSpeech: 'adjective',
        definition: 'Tending to keep a firm hold of something; persistent and determined.',
        example: 'Her tenacious pursuit of scientific truth led to a historic breakthrough.'
      }
    ]
  },
  {
    word: 'catalyst',
    definitions: [
      {
        partOfSpeech: 'noun',
        definition: 'A person or thing that precipitates or accelerates an event or change.',
        example: 'The keynote speech served as a catalyst for educational reform.'
      }
    ]
  }
];

export const migration001Initial: Migration = {
  id: 'vocab_001_initial',
  name: 'Initial Vocabulary Schema and Starter Data',
  modeId: 'vocab',
  up: (db: Database) => {
    // 1. Create vocab_words table
    db.exec(`
      CREATE TABLE IF NOT EXISTS vocab_words (
        id TEXT PRIMARY KEY,
        display_word TEXT NOT NULL,
        normalized_word TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en',
        created_at TEXT NOT NULL,
        updated_at TEXT,
        UNIQUE(normalized_word, language)
      );
    `);

    // 2. Create vocab_definitions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS vocab_definitions (
        id TEXT PRIMARY KEY,
        word_id TEXT NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
        part_of_speech TEXT NOT NULL,
        definition TEXT NOT NULL,
        example TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'local',
        model_identifier TEXT,
        prompt_version INTEGER DEFAULT 1,
        generated_at TEXT NOT NULL,
        updated_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_vocab_definitions_word_id ON vocab_definitions(word_id);
    `);

    // 3. Seed starter words if table is completely empty
    const countRow = db.prepare('SELECT COUNT(*) as count FROM vocab_words').get() as { count: number };
    if (countRow.count === 0) {
      const now = new Date().toISOString();
      const insertWord = db.prepare(`
        INSERT INTO vocab_words (id, display_word, normalized_word, language, created_at, updated_at)
        VALUES (?, ?, ?, 'en', ?, ?)
      `);

      const insertDef = db.prepare(`
        INSERT INTO vocab_definitions (id, word_id, part_of_speech, definition, example, source, model_identifier, prompt_version, generated_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'local', 'starter_dataset', 1, ?, ?)
      `);

      for (let i = 0; i < STARTER_WORDS.length; i++) {
        const item = STARTER_WORDS[i];
        const wordId = `word_seed_${i + 1}_${Date.now()}`;
        const normalized = item.word.toLowerCase();
        insertWord.run(wordId, item.word, normalized, now, now);

        for (let j = 0; j < item.definitions.length; j++) {
          const def = item.definitions[j];
          const defId = `def_seed_${i + 1}_${j + 1}_${Date.now()}`;
          insertDef.run(defId, wordId, def.partOfSpeech, def.definition, def.example, now, now);
        }
      }
    }
  }
};
