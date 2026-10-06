import { GoogleGenAI } from '@google/genai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { secretsService } from '../settings/secrets';
import { settingsService } from '../settings/service';
import { AvailableModel, ListModelsResult, TestConnectionResult } from '../../shared/contracts/settings';

export interface GenerateStructuredRequest<T> {
  prompt: string;
  systemInstruction?: string;
  modelOverride?: string;
  schemaValidator: (rawJson: unknown) => T;
}

export class GeminiClient {
  public async listModels(apiKeyOverride?: string): Promise<ListModelsResult> {
    const key = apiKeyOverride?.trim() || this.getApiKey();
    if (!key) return { success: false, models: [], error: 'Enter a key or save one before refreshing models.' };
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const pager = await ai.models.list({ config: { pageSize: 100, httpOptions: { timeout: 15000, retryOptions: { attempts: 1 } } } });
      const models: AvailableModel[] = [];
      for await (const model of pager) {
        const id = model.name?.replace(/^models\//, '');
        if (!id?.startsWith('gemini-') || !model.supportedActions?.includes('generateContent') || /image|tts|audio|live|robotics|computer-use|transcribe|omni/i.test(id)) continue;
        models.push({ id, name: model.displayName || id, description: model.description || 'Gemini text model' });
      }
      return { success: true, models: [...new Map(models.map(m => [m.id, m])).values()].sort((a, b) => a.name.localeCompare(b.name)) };
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      return { success: false, models: [], error: this.sanitizeErrorMessage(new Error(raw.split(key).join('[REDACTED]'))) };
    }
  }

  public getApiKey(): string | null {
    return secretsService.getKey();
  }

  public async testConnection(modelOverride?: string, apiKeyOverride?: string): Promise<TestConnectionResult> {
    const key = apiKeyOverride?.trim() || this.getApiKey();
    if (!key) return { success: false, message: 'Enter a Gemini API key or save one first.' };
    const model = modelOverride || settingsService.getModel();
    const startTime = Date.now();
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model,
        contents: 'Reply with exactly OK.',
        config: { maxOutputTokens: 64, httpOptions: { timeout: 15000, retryOptions: { attempts: 1 } } }
      });
      if (!response.text?.trim()) return { success: false, message: 'Gemini returned no text. Try another model.' };
      return {
        success: true,
        message: `Gemini accepted the key and responded using ${model}. ${apiKeyOverride ? 'The entered key was tested without saving it.' : 'Your saved key was tested.'}`,
        modelUsed: model,
        latencyMs: Date.now() - startTime
      };
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      const redacted = raw.split(key).join('[REDACTED]');
      return { success: false, message: `Connection test failed: ${this.sanitizeErrorMessage(new Error(redacted))}` };
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
