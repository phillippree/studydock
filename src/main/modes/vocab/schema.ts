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

const exampleSchema = z.object({
  example: z.string().trim().min(3, 'Example must be at least 3 characters').max(1000, 'Example exceeds maximum length'),
  voice: z.enum(['active', 'passive', 'other'])
});

const senseSchema = z.object({
  partOfSpeech: z.enum(ALLOWED_PARTS_OF_SPEECH as [string, ...string[]]).transform(val => val.toLowerCase() as PartOfSpeech),
  definition: z.string().trim().min(3, 'Definition must be at least 3 characters').max(1000, 'Definition exceeds maximum length'),
  synonyms: z.array(z.string().trim().min(1).max(100)).max(8).default([]),
  examples: z.array(exampleSchema).length(6, 'Each definition must contain exactly six examples')
});

export const geminiVocabRawSchema = z.object({
  word: z.string().trim().min(1, 'Word cannot be empty'),
  language: z.string().trim().default('en'),
  recognized: z.boolean(),
  senses: z.array(senseSchema),
  suggestions: z.array(z.string().trim().min(1).max(100)).max(5).default([])
});

export function validateAndNormalizeVocabResponse(
  rawJson: unknown,
  expectedNormalizedWord: string,
  expectedLanguage = 'en'
): GeminiVocabResponse {
  const parsed = geminiVocabRawSchema.parse(rawJson);

  const expected = normalizeWord(expectedNormalizedWord);
  const returned = normalizeWord(parsed.word);
  const suggestions = [...new Set([parsed.word, ...parsed.suggestions]
    .map(candidate => candidate.trim())
    .filter(candidate => candidate && normalizeWord(candidate) !== expected)
    .filter(candidate => candidate.length <= 100))].slice(0, 5);

  // A canonical spelling different from the submitted spelling should be offered for confirmation,
  // never silently saved under the user's original input.
  if (returned !== expected) {
    return {
      word: expectedNormalizedWord,
      language: expectedLanguage,
      recognized: false,
      senses: [],
      suggestions
    };
  }

  if (parsed.recognized) {
    if (!parsed.senses || parsed.senses.length === 0) {
      throw new Error('Recognized word response must contain at least one sense/definition.');
    }
    for (const sense of parsed.senses) {
      const uniqueExamples = new Set(sense.examples.map(item => item.example.toLowerCase()));
      if (uniqueExamples.size !== 6) {
        throw new Error('Each definition must contain six distinct examples.');
      }
      const uniqueSynonyms = new Set(sense.synonyms.map(item => normalizeWord(item)));
      if (uniqueSynonyms.size !== sense.synonyms.length) {
        throw new Error('Each definition must contain distinct synonyms.');
      }
      if (sense.synonyms.some(item => normalizeWord(item) === normalizeWord(expectedNormalizedWord))) {
        throw new Error('A synonym cannot repeat the requested word.');
      }
    }
  } else {
    // Unrecognized word must have empty senses
    return {
      word: expectedNormalizedWord,
      language: expectedLanguage,
      recognized: false,
      senses: [],
      suggestions
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
