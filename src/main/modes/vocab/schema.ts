import { z } from 'zod';
import { GeminiVocabResponse, PartOfSpeech } from '../../../shared/contracts/vocab';

export const ALLOWED_PARTS_OF_SPEECH: [PartOfSpeech, ...PartOfSpeech[]] = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'preposition',
  'conjunction',
  'interjection',
  'idiom',
  'phrase',
  'other'
];

const senseSchema = z.object({
  partOfSpeech: z.enum(ALLOWED_PARTS_OF_SPEECH as [string, ...string[]]).transform(val => val.toLowerCase() as PartOfSpeech),
  definition: z.string().trim().min(3, 'Definition must be at least 3 characters').max(1000, 'Definition exceeds maximum length'),
  example: z.string().trim().min(3, 'Example must be at least 3 characters').max(1000, 'Example exceeds maximum length')
});

export const geminiVocabRawSchema = z.object({
  word: z.string().trim().min(1, 'Word cannot be empty'),
  language: z.string().trim().default('en'),
  recognized: z.boolean(),
  senses: z.array(senseSchema)
});

export function validateAndNormalizeVocabResponse(
  rawJson: unknown,
  expectedNormalizedWord: string,
  expectedLanguage = 'en'
): GeminiVocabResponse {
  const parsed = geminiVocabRawSchema.parse(rawJson);

  // Verify normalized match
  const returnedNormalized = parsed.word.trim().toLowerCase();
  if (returnedNormalized !== expectedNormalizedWord.toLowerCase()) {
    // If the model returned a slight variation (like plural or capitalization), normalize it
    // but if it's completely different, reject
    if (!returnedNormalized.includes(expectedNormalizedWord) && !expectedNormalizedWord.includes(returnedNormalized)) {
      throw new Error(`Returned word "${parsed.word}" does not match requested word "${expectedNormalizedWord}"`);
    }
  }

  if (parsed.recognized) {
    if (!parsed.senses || parsed.senses.length === 0) {
      throw new Error('Recognized word response must contain at least one sense/definition.');
    }
  } else {
    // Unrecognized word must have empty senses
    return {
      word: expectedNormalizedWord,
      language: expectedLanguage,
      recognized: false,
      senses: []
    };
  }

  return {
    word: parsed.word,
    language: parsed.language || expectedLanguage,
    recognized: true,
    senses: parsed.senses as GeminiVocabResponse['senses']
  };
}

export function normalizeWord(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ');
}
