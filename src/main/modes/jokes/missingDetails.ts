import { z } from 'zod';
import { JokeExampleVoice, JokeType } from '../../../shared/contracts/jokes';
import { normalizeJokeText } from './schema';

const detailsSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  type: z.enum(['joke', 'punchline']),
  language: z.string().trim().min(2).max(20),
  recognized: z.boolean(),
  explanation: z.string().trim().min(8).max(2000).nullable(),
  examples: z.array(z.object({ example: z.string().trim().min(5).max(1000), voice: z.enum(['active', 'passive', 'other']) })).max(6)
});

export function buildJokeMissingDetailsPrompt(text: string, type: JokeType, language: string): string {
  return JSON.stringify({
    task: 'explain_saved_joke', text, type, language,
    instructions: 'The saved joke text is fixed. Explain the humor of this exact wording; do not rewrite the joke. Create six distinct example sentences showing its use in context, with active and passive voice examples. If it is not recognizable as a joke or punchline, return recognized false, explanation null, and no examples.',
    response_format: { text, type, language, recognized: true, explanation: 'Why the joke works.', examples: Array.from({ length: 6 }, (_, index) => ({ example: `Example ${index + 1} using the saved joke.`, voice: index % 2 ? 'passive' : 'active' })) }
  });
}

export function validateJokeMissingDetails(raw: unknown, text: string, type: JokeType, language: string): { recognized: boolean; explanation: string | null; examples: Array<{ example: string; voice: JokeExampleVoice }> } {
  const result = detailsSchema.parse(raw);
  if (normalizeJokeText(result.text) !== normalizeJokeText(text) || result.type !== type || result.language.toLowerCase() !== language.toLowerCase()) {
    throw new Error('Gemini returned details for a different joke. Nothing was saved.');
  }
  if (!result.recognized) return { recognized: false, explanation: null, examples: [] };
  if (!result.explanation || result.examples.length !== 6 || new Set(result.examples.map(item => normalizeJokeText(item.example))).size !== 6 ||
      !result.examples.some(item => item.voice === 'active') || !result.examples.some(item => item.voice === 'passive')) {
    throw new Error('Gemini did not provide six distinct examples with active and passive voice. Nothing was saved.');
  }
  return { recognized: true, explanation: result.explanation, examples: result.examples };
}
