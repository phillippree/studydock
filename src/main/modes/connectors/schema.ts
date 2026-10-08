import { z } from 'zod';
import { CONNECTOR_CATEGORIES, ConnectorCategory, ConnectorVoice } from '../../../shared/contracts/connectors';

export function normalizeConnector(value: string): string {
  return value.trim().toLocaleLowerCase().normalize('NFKC').replace(/\s+/g, ' ');
}

function normalizeSuggestions(value: string | string[] | null | undefined): string[] | undefined {
  if (!value) return undefined;
  const quotedCandidates = typeof value === 'string'
    ? [...value.matchAll(/["“‘']([^"”’']{1,120})["”’']/g)].map(match => match[1])
    : [];
  const candidates = Array.isArray(value) ? value : quotedCandidates.length ? quotedCandidates : [value];
  const cleaned = candidates
    .map(candidate => candidate.trim())
    .filter(candidate => candidate.length > 0 && candidate.length <= 120)
    .filter(candidate => !/\b(submitted text|complete clause|consider using|if you intended|correct connector)\b/i.test(candidate));
  const distinct = [...new Map(cleaned.map(candidate => [normalizeConnector(candidate), candidate])).values()].slice(0, 5);
  return distinct.length > 0 ? distinct : undefined;
}

const rawConnectorSchema = z.object({
  connector: z.string().trim().min(1).max(120),
  category: z.enum(CONNECTOR_CATEGORIES),
  language: z.string().trim().min(2).max(20).default('en'),
  recognized: z.boolean(),
  meaning: z.string().trim().min(3).max(2000).nullable().optional(),
  examples: z.array(z.object({
    example: z.string().trim().min(3).max(1000),
    voice: z.enum(['active', 'passive', 'other'])
  })).max(6).default([]),
  suggestion: z.string().trim().max(1000).nullable().optional(),
  suggestions: z.array(z.string().trim().min(1).max(120)).max(5).nullable().optional()
}).transform(result => ({
  ...result,
  suggestions: normalizeSuggestions(result.suggestions ?? result.suggestion)
}));

export interface ValidatedConnectorLookup {
  connector: string;
  category: ConnectorCategory;
  language: string;
  recognized: boolean;
  meaning?: string;
  examples: Array<{ example: string; voice: ConnectorVoice }>;
  suggestions?: string[];
}

export function validateConnectorLookup(raw: unknown, expectedConnector: string, expectedLanguage: string, expectedCategory?: ConnectorCategory): ValidatedConnectorLookup {
  const result = rawConnectorSchema.parse(raw);
  if (normalizeConnector(result.connector) !== normalizeConnector(expectedConnector) || result.language.toLocaleLowerCase() !== expectedLanguage.toLocaleLowerCase() || expectedCategory && result.category !== expectedCategory) {
    return {
      connector: expectedConnector,
      category: result.category,
      language: expectedLanguage,
      recognized: false,
      examples: [],
      suggestions: result.suggestions || (normalizeConnector(result.connector) !== normalizeConnector(expectedConnector) ? [result.connector] : undefined)
    };
  }
  if (!result.recognized) {
    return { connector: expectedConnector, category: result.category, language: expectedLanguage, recognized: false, examples: [], suggestions: result.suggestions };
  }
  if (result.suggestions?.length && !result.suggestions.some(suggestion => normalizeConnector(suggestion) === normalizeConnector(expectedConnector))) {
    return { connector: expectedConnector, category: result.category, language: expectedLanguage, recognized: false, examples: [], suggestions: result.suggestions };
  }
  if (!result.meaning || result.examples.length !== 6) throw new Error('A recognized connector must include a meaning and exactly six examples.');
  const unique = new Set(result.examples.map(example => normalizeConnector(example.example)));
  if (unique.size !== 6) throw new Error('Connector examples must be distinct.');
  if (!result.examples.some(example => example.voice === 'active') || !result.examples.some(example => example.voice === 'passive')) {
    throw new Error('Connector examples must include active and passive voice when the connector is recognized.');
  }
  return {
    connector: expectedConnector,
    category: result.category,
    language: result.language,
    recognized: true,
    meaning: result.meaning,
    examples: result.examples
  };
}
