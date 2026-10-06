export type PartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'pronoun'
  | 'preposition'
  | 'conjunction'
  | 'interjection'
  | 'idiom'
  | 'phrase'
  | 'other';

export interface VocabSense {
  id?: string;
  partOfSpeech: PartOfSpeech;
  definition: string;
  example: string;
  examples?: VocabExample[];
  synonyms?: string[];
}

export type ExampleVoice = 'active' | 'passive' | 'other';

export interface VocabExample {
  id?: string;
  example: string;
  position: number;
  voice: ExampleVoice;
}

export interface VocabWord {
  id: string;
  displayWord: string;
  normalizedWord: string;
  language: string;
  createdAt: string;
  updatedAt?: string;
}

export interface VocabDefinition {
  id: string;
  wordId: string;
  partOfSpeech: PartOfSpeech;
  definition: string;
  /** First example retained for compatibility with manual-edit forms and older exports. */
  example: string;
  examples: VocabExample[];
  synonyms: string[];
  source: 'gemini' | 'manual' | 'local';
  modelIdentifier?: string;
  promptVersion?: number;
  generatedAt: string;
  updatedAt?: string;
}

export type WordDefinitionStatus =
  | 'saved_locally'
  | 'generated_gemini'
  | 'not_saved'
  | 'unrecognized'
  | 'error'
  | 'loading';

export interface VocabWordWithDefinitions {
  word: VocabWord;
  definitions: VocabDefinition[];
  status: WordDefinitionStatus;
  generationError?: string;
}

export interface GeminiVocabSense {
  partOfSpeech: string;
  definition: string;
  examples: Array<{ example: string; voice: ExampleVoice }>;
  synonyms: string[];
}

export interface GeminiVocabResponse {
  word: string;
  language: string;
  recognized: boolean;
  senses: GeminiVocabSense[];
  suggestions?: string[];
}

export interface AddWordInput {
  word: string;
  language?: string;
}

export type VerifyAndAddWordResult =
  | { status: 'added'; word: VocabWord; definitions: VocabDefinition[] }
  | { status: 'duplicate'; word: VocabWord }
  | { status: 'suggestions'; enteredWord: string; suggestions: string[] }
  | { status: 'unrecognized'; enteredWord: string }
  | { status: 'error'; enteredWord: string; message: string };

export interface EditWordInput {
  id: string;
  displayWord: string;
  language?: string;
}

export interface EditDefinitionInput {
  id: string;
  partOfSpeech: PartOfSpeech;
  definition: string;
  example: string;
}

export interface AddDefinitionInput {
  wordId: string;
  partOfSpeech: PartOfSpeech;
  definition: string;
  example: string;
  examples?: VocabExample[];
  synonyms?: string[];
  source?: 'manual' | 'gemini' | 'local';
}

export interface ImportWordsResult {
  imported: number;
  duplicates: number;
  rejected: number;
  total: number;
  errors?: string[];
}

export interface ExportWordData {
  displayWord: string;
  normalizedWord: string;
  language: string;
  createdAt: string;
  definitions: Array<{
    partOfSpeech: string;
    definition: string;
    example: string;
    examples?: VocabExample[];
    synonyms?: string[];
    source: string;
    modelIdentifier?: string;
    generatedAt: string;
  }>;
}

export interface ExportData {
  version: number;
  appName: string;
  exportedAt: string;
  words: ExportWordData[];
}
