import { ModeDescriptor } from './modes';
import { ListModelsResult, GeminiSettings, SaveKeyInput, TestConnectionResult } from './settings';
import {
  AddDefinitionInput,
  AddWordInput,
  EditDefinitionInput,
  EditWordInput,
  ExportData,
  ImportWordsResult,
  VocabDefinition,
  VocabPronunciationAudio,
  VocabWord,
  VocabWordWithDefinitions,
  VerifyAndAddWordResult
} from './vocab';
import { WordQuizAnswer } from './wordQuiz';
import { ExpressionType, IdiomPhraseEntry, IdiomPhraseListPage, IdiomPhraseListQuery, IdiomPhraseQuizPrompt, LookupExpressionResult, SaveExpressionResult } from './idiomsPhrases';
import { UpdateCheckResult } from './updates';

export interface StudyDockAPI {
  // Application updates
  checkForUpdates(): Promise<UpdateCheckResult>;
  openLatestRelease(): Promise<{ success: boolean }>;

  // Modes
  getModes(): Promise<ModeDescriptor[]>;

  // Settings & Gemini Credentials
  getSettings(): Promise<GeminiSettings>;
  saveApiKey(input: SaveKeyInput): Promise<{ success: boolean; error?: string }>;
  removeApiKey(): Promise<{ success: boolean }>;
  testConnection(model?: string, apiKey?: string): Promise<TestConnectionResult>;
  listModels(apiKey?: string): Promise<ListModelsResult>;
  setModel(model: string): Promise<{ success: boolean }>;
  openStorageFolder(): Promise<{ success: boolean }>;

  // Vocabulary Mode Operations
  vocabGetRandomWord(options?: { excludeWordId?: string }): Promise<VocabWordWithDefinitions | null>;
  vocabFetchDefinition(wordId: string, forceRefresh?: boolean): Promise<VocabWordWithDefinitions>;
  vocabSaveDefinitionRetry(wordId: string, senses: Array<{ partOfSpeech: string; definition: string; example: string; examples?: VocabDefinition['examples']; synonyms?: string[]; source?: string }>): Promise<VocabWordWithDefinitions>;
  vocabGetAllWords(): Promise<Array<VocabWord & { definitionCount: number }>>;
  vocabGetWordDetails(wordId: string): Promise<VocabWordWithDefinitions | null>;
  vocabAddWord(input: AddWordInput): Promise<{ word: VocabWord; isDuplicate: boolean }>;
  vocabVerifyAndAddWord(input: AddWordInput): Promise<VerifyAndAddWordResult>;
  vocabEditWord(input: EditWordInput): Promise<VocabWord>;
  vocabDeleteWord(wordId: string): Promise<{ success: boolean; deletedWord: VocabWord }>;
  vocabAddDefinition(input: AddDefinitionInput): Promise<VocabDefinition>;
  vocabEditDefinition(input: EditDefinitionInput): Promise<VocabDefinition>;
  vocabDeleteDefinition(definitionId: string): Promise<{ success: boolean }>;
  vocabImportWords(content: string, language?: string): Promise<ImportWordsResult>;
  vocabExportData(): Promise<ExportData>;
  vocabGetPronunciation(wordId: string): Promise<VocabPronunciationAudio>;

  // Word Quiz mode
  wordQuizGetRandomWord(excludeWordId?: string): Promise<VocabWord | null>;
  wordQuizGetWord(wordId: string): Promise<VocabWord | null>;
  wordQuizRevealDefinition(wordId: string): Promise<WordQuizAnswer['definitions']>;

  // Idioms & Phrases mode
  idiomsPhrasesList(query?: IdiomPhraseListQuery): Promise<IdiomPhraseListPage>;
  idiomsPhrasesLookup(input: { expression: string; type: ExpressionType; language?: string }): Promise<LookupExpressionResult>;
  idiomsPhrasesSavePreview(token: string): Promise<SaveExpressionResult>;
  idiomsPhrasesRefreshExamples(id: string): Promise<IdiomPhraseEntry>;
  idiomsPhrasesQuizGetRandom(type?: ExpressionType, excludeId?: string): Promise<IdiomPhraseQuizPrompt | null>;
  idiomsPhrasesQuizReveal(id: string): Promise<IdiomPhraseEntry>;
}

declare global {
  interface Window {
    studydockBridge: StudyDockAPI;
  }
}
