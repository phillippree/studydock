import { z } from 'zod';
import { ExampleVoice, ExpressionType } from '../../../shared/contracts/idiomsPhrases';

const rawLookupSchema = z.object({
  expression: z.string().trim().min(1).max(120),
  type: z.enum(['idiom', 'phrase']),
  language: z.string().trim().min(2).max(20).default('en'),
  recognized: z.boolean(),
  meaning: z.string().trim().min(3).max(2000).optional(),
  examples: z.array(z.object({
    example: z.string().trim().min(3).max(1000),
    voice: z.enum(['active', 'passive', 'other'])
  })).max(6).default([]),
  suggestion: z.string().trim().min(1).max(120).nullable().optional()
});

export interface ValidatedExpressionLookup {
  expression: string;
  language: string;
  recognized: boolean;
  meaning?: string;
  examples: Array<{ example: string; voice: ExampleVoice }>;
  suggestion?: string;
}

export function normalizeExpression(value: string): string {
  return value.trim().toLocaleLowerCase().normalize('NFKC').replace(/\s+/g, ' ');
}

export function validateExpressionLookup(
  raw: unknown,
  expectedExpression: string,
  expectedLanguage: string,
  expectedType: ExpressionType
): ValidatedExpressionLookup {
  const result = rawLookupSchema.parse(raw);
  const expected = normalizeExpression(expectedExpression);
  const returned = normalizeExpression(result.expression);
  if (returned !== expected || result.type !== expectedType || result.language.toLocaleLowerCase() !== expectedLanguage.toLocaleLowerCase()) {
    return { expression: expectedExpression, language: expectedLanguage, recognized: false, examples: [], suggestion: returned !== expected ? result.suggestion || result.expression : undefined };
  }
  if (!result.recognized) {
    return { expression: expectedExpression, language: expectedLanguage, recognized: false, examples: [], suggestion: result.suggestion || undefined };
  }
  if (!result.meaning || result.examples.length !== 6) {
    throw new Error('A recognized expression must include a meaning and exactly six examples.');
  }
  const uniqueExamples = new Set(result.examples.map(example => normalizeExpression(example.example)));
  if (uniqueExamples.size !== result.examples.length) throw new Error('Examples must be distinct.');
  return {
    expression: expectedExpression,
    language: result.language || expectedLanguage,
    recognized: true,
    meaning: result.meaning,
    examples: result.examples
  };
}
