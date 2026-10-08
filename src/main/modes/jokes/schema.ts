import { z } from 'zod';
import { JokeExampleVoice, JokeType } from '../../../shared/contracts/jokes';

const jokeExamplesSchema = z.array(z.object({
  example: z.string().trim().min(5).max(1000),
  voice: z.enum(['active', 'passive', 'other'])
})).max(6);

const jokeResponseSchema = z.object({
  submittedText: z.string().trim().min(1).max(2000),
  type: z.enum(['joke', 'punchline']),
  language: z.string().trim().min(2).max(20).default('en'),
  recognized: z.boolean(),
  variations: z.array(z.object({
    text: z.string().trim().min(3).max(2000),
    explanation: z.string().trim().min(8).max(2000),
    examples: jokeExamplesSchema
  })).max(4).default([]),
  suggestion: z.string().trim().max(500).nullable().optional()
});

export interface ValidatedJokeVariation {
  text: string;
  explanation: string;
  examples: Array<{ example: string; voice: JokeExampleVoice }>;
}

export interface ValidatedJokeLookup {
  text: string;
  type: JokeType;
  language: string;
  recognized: boolean;
  variations: ValidatedJokeVariation[];
  suggestion?: string;
}

export function normalizeJokeText(value: string): string {
  return value.trim().toLocaleLowerCase().normalize('NFKC').replace(/\s+/g, ' ');
}

function comparableJokeText(value: string): string {
  return value.toLocaleLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

export function validateJokeLookup(raw: unknown, expectedText: string, expectedType: JokeType, expectedLanguage: string): ValidatedJokeLookup {
  const result = jokeResponseSchema.parse(raw);
  const identityMatches = normalizeJokeText(result.submittedText) === normalizeJokeText(expectedText)
    && result.type === expectedType
    && result.language.toLocaleLowerCase() === expectedLanguage.toLocaleLowerCase();
  if (!identityMatches) {
    return { text: expectedText, type: expectedType, language: expectedLanguage, recognized: false, variations: [], suggestion: result.suggestion || undefined };
  }
  if (!result.recognized || !result.variations.length) {
    return { text: expectedText, type: expectedType, language: expectedLanguage, recognized: false, variations: [], suggestion: result.suggestion || undefined };
  }
  if (result.variations.length < 2 || result.variations.length > 3) throw new Error('A recognized joke idea must include two or three wording variations.');

  const distinctVariations = new Set(result.variations.map(variation => normalizeJokeText(variation.text)));
  if (distinctVariations.size !== result.variations.length) throw new Error('Joke wording variations must be distinct.');
  const comparableSubmitted = comparableJokeText(expectedText);
  const submittedWordCount = comparableSubmitted.split(' ').filter(Boolean).length;
  for (const variation of result.variations) {
    const comparableVariation = comparableJokeText(variation.text);
    if (comparableVariation === comparableSubmitted || submittedWordCount >= 6 && comparableVariation.includes(comparableSubmitted)) {
      throw new Error('Joke variations must rewrite the joke itself, not just quote it in a sentence about telling or sharing it.');
    }
    if (variation.examples.length !== 6) throw new Error('Each recognized joke variation must include exactly six example sentences.');
    if (new Set(variation.examples.map(item => normalizeJokeText(item.example))).size !== 6) throw new Error('Joke example sentences must be distinct.');
    if (!variation.examples.some(item => item.voice === 'active') || !variation.examples.some(item => item.voice === 'passive')) {
      throw new Error('Joke examples must include active and passive voice.');
    }
  }
  return { text: expectedText, type: expectedType, language: expectedLanguage, recognized: true, variations: result.variations };
}
