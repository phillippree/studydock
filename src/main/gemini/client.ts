import { GoogleGenAI } from '@google/genai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { secretsService } from '../settings/secrets';
import { settingsService } from '../settings/service';
import { TestConnectionResult } from '../../shared/contracts/settings';

export interface GenerateStructuredRequest<T> {
  prompt: string;
  systemInstruction?: string;
  modelOverride?: string;
  schemaValidator: (rawJson: unknown) => T;
}

export class GeminiClient {
  public getApiKey(): string | null {
    return secretsService.getKey();
  }

  public async testConnection(modelOverride?: string, apiKeyOverride?: string): Promise<TestConnectionResult> {
    const key = apiKeyOverride || this.getApiKey();
    if (!key) {
      return {
        success: false,
        message: 'No API key provided. Please enter and save your Gemini API key.'
      };
    }

    const model = modelOverride || settingsService.getModel();
    const startTime = Date.now();

    try {
      // Test using @google/genai first, fallback to @google/generative-ai
      try {
        const ai = new GoogleGenAI({ apiKey: key });
        const response = await ai.models.generateContent({
          model,
          contents: 'Respond with exactly: {"status":"ok"}',
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        });

        const text = response.text || '';
        if (text) {
          const latencyMs = Date.now() - startTime;
          return {
            success: true,
            message: `Successfully connected to Gemini API using ${model}!`,
            modelUsed: model,
            latencyMs
          };
        }
      } catch (errGenAi) {
        // Fallback to @google/generative-ai
        const genAI = new GoogleGenerativeAI(key);
        const genModel = genAI.getGenerativeModel({
          model,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        });
        const result = await genModel.generateContent('Respond with exactly: {"status":"ok"}');
        const text = result.response.text();
        if (text) {
          const latencyMs = Date.now() - startTime;
          return {
            success: true,
            message: `Successfully connected to Gemini API using ${model}!`,
            modelUsed: model,
            latencyMs
          };
        }
        throw errGenAi;
      }

      return {
        success: false,
        message: 'Received an empty response from Gemini API.'
      };
    } catch (err: unknown) {
      const errorMsg = this.sanitizeErrorMessage(err);
      return {
        success: false,
        message: `Connection test failed: ${errorMsg}`
      };
    }
  }

  public async generateStructured<T>(req: GenerateStructuredRequest<T>): Promise<T> {
    const key = this.getApiKey();
    if (!key) {
      throw new Error('Gemini API key is missing. Please configure your API key in Settings.');
    }

    const model = req.modelOverride || settingsService.getModel();

    let rawText = '';
    try {
      // Try with @google/genai
      try {
        const ai = new GoogleGenAI({ apiKey: key });
        const response = await ai.models.generateContent({
          model,
          contents: req.prompt,
          config: {
            systemInstruction: req.systemInstruction,
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        });
        rawText = response.text || '';
      } catch (errGenAi) {
        // Fallback to @google/generative-ai
        const genAI = new GoogleGenerativeAI(key);
        const genModel = genAI.getGenerativeModel({
          model,
          systemInstruction: req.systemInstruction,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        });
        const result = await genModel.generateContent(req.prompt);
        rawText = result.response.text();
      }
    } catch (err: unknown) {
      const cleanError = this.sanitizeErrorMessage(err);
      throw new Error(`Gemini request failed: ${cleanError}`);
    }

    if (!rawText || !rawText.trim()) {
      throw new Error('Gemini returned an empty response.');
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText.trim());
    } catch {
      // Sometimes JSON might be enclosed in markdown code fences ```json ... ```
      const match = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        try {
          parsedJson = JSON.parse(match[1].trim());
        } catch {
          throw new Error('Gemini response could not be parsed as JSON.');
        }
      } else {
        throw new Error('Gemini response could not be parsed as valid JSON.');
      }
    }

    return req.schemaValidator(parsedJson);
  }

  private sanitizeErrorMessage(err: unknown): string {
    if (!err) return 'Unknown error';
    let msg = err instanceof Error ? err.message : String(err);

    // Redact any potential API key patterns (e.g. AIzaSy...)
    msg = msg.replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]');

    if (msg.includes('API_KEY_INVALID') || msg.includes('400') && msg.includes('API key not valid')) {
      return 'The provided Gemini API key is invalid. Please check your key in settings.';
    }
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota exceeded')) {
      return 'Gemini rate limit or quota exceeded. Please wait a moment or check your billing plan.';
    }
    if (msg.includes('404') || msg.includes('models/') && msg.includes('not found')) {
      return 'The selected Gemini model was not found or is not supported. Please select a supported model in settings.';
    }
    if (msg.includes('ENOTFOUND') || msg.includes('fetch failed') || msg.includes('network')) {
      return 'Network connection failed. Please check your internet connection.';
    }

    return msg;
  }
}

export const geminiClient = new GeminiClient();
