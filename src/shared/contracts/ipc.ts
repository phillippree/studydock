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
  VocabWord,
  VocabWordWithDefinitions
} from './vocab';

export interface StudyDockAPI {
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
  vocabSaveDefinitionRetry(wordId: string, senses: Array<{ partOfSpeech: string; definition: string; example: string; source?: string }>): Promise<VocabWordWithDefinitions>;
  vocabGetAllWords(): Promise<Array<VocabWord & { definitionCount: number }>>;
  vocabGetWordDetails(wordId: string): Promise<VocabWordWithDefinitions | null>;
  vocabAddWord(input: AddWordInput): Promise<{ word: VocabWord; isDuplicate: boolean }>;
  vocabEditWord(input: EditWordInput): Promise<VocabWord>;
  vocabDeleteWord(wordId: string): Promise<{ success: boolean; deletedWord: VocabWord }>;
  vocabAddDefinition(input: AddDefinitionInput): Promise<VocabDefinition>;
  vocabEditDefinition(input: EditDefinitionInput): Promise<VocabDefinition>;
  vocabDeleteDefinition(definitionId: string): Promise<{ success: boolean }>;
  vocabImportWords(content: string, language?: string): Promise<ImportWordsResult>;
  vocabExportData(): Promise<ExportData>;
}

declare global {
  interface Window {
    studydockBridge: StudyDockAPI;
  }
}
