export interface AvailableModel {
  id: string;
  name: string;
  description: string;
  isRecommended?: boolean;
}

export const SUPPORTED_GEMINI_MODELS: AvailableModel[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Latest standard model for fast, high-quality reasoning and structured outputs',
    isRecommended: true
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    description: 'Fast, efficient multimodal and structured generation'
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    description: 'Fast and lightweight model for general text tasks'
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    description: 'High-capability model for complex multi-step reasoning'
  }
];

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
