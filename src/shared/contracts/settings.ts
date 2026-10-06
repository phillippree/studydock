export interface AvailableModel {
  id: string;
  name: string;
  description: string;
  isRecommended?: boolean;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

// Suggested models; use discovery and a connection test to verify access.
export const SUPPORTED_GEMINI_MODELS: AvailableModel[] = [
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', description: 'Fast, economical vocabulary definitions', isRecommended: true },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', description: 'General-purpose reasoning and text generation' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite', description: 'Efficient text generation' },
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', description: 'General-purpose text generation' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Preview)', description: 'Advanced reasoning; preview model' },
];

export interface ListModelsResult {
  success: boolean;
  models: AvailableModel[];
  error?: string;
}

export interface GeminiSettings {
  hasKey: boolean;
  apiKeyMasked: string | null;
  isSessionOnly: boolean;
  isEncryptionAvailable: boolean;
  model: string;
  storageLocation: string;
  databasePath: string;
}

export interface SaveKeyInput {
  apiKey: string;
  sessionOnly?: boolean;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  modelUsed?: string;
  latencyMs?: number;
}
