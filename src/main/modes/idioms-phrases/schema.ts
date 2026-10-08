import { z } from 'zod';
import { ExampleVoice, ExpressionType } from '../../../shared/contracts/idiomsPhrases';

function normalizeSuggestion(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (!text) return undefined;

  // Gemini may explain a correction despite being asked for just the corrected expression.
  const explainedCorrection = text.match(/(?:correct(?:\s+grammatical)?\s+(?:form|phrase|expression)\s+is|did\s+you\s+mean)\s+["“‘']([^"”’']{1,120})["”’']/i);
  if (explainedCorrection?.[1]) return explainedCorrection[1].trim();

  const quotedExpression = text.match(/^["“‘']([^"”’']{1,120})["”’']$/);
  if (quotedExpression?.[1]) return quotedExpression[1].trim();

  // Do not show a model explanation as though it were a usable phrase.
  if (text.length > 120 || /\b(correct grammatical form|plural subject|did you mean|the correct)\b/i.test(text)) return undefined;
  return text;
}

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
  suggestion: z.string().trim().max(500).nullable().optional().transform(normalizeSuggestion)
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
    return { expression: expectedExpression, language: expectedLanguage, recognized: false, examples: [], suggestion: result.suggestion || (returned !== expected ? result.expression : undefined) };
  }
  if (!result.recognized) {
    return { expression: expectedExpression, language: expectedLanguage, recognized: false, examples: [], suggestion: result.suggestion || undefined };
  }
  if (result.suggestion && normalizeExpression(result.suggestion) !== expected) {
    return { expression: expectedExpression, language: expectedLanguage, recognized: false, examples: [], suggestion: result.suggestion };
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
