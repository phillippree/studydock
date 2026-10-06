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

export interface GenerateSpeechRequest {
  text: string;
  language: string;
  model?: string;
  voice?: string;
}

export class GeminiClient {
  private logGemini(direction: 'REQUEST' | 'RESPONSE' | 'ERROR', details: unknown, apiKey?: string): void {
    const redact = (value: unknown): unknown => {
      if (typeof value === 'string') {
        let safe = apiKey ? value.split(apiKey).join('[REDACTED_API_KEY]') : value;
        safe = safe.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_API_KEY]');
        return safe;
      }
      if (Array.isArray(value)) return value.map(redact);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redact(entry)]));
      }
      return value;
    };

    // Log the Gemini payload and result for diagnostics, while never logging credentials.
    console.info(`[StudyDock Gemini ${direction}]\n${JSON.stringify(redact(details), null, 2)}`);
  }

  public async listModels(apiKeyOverride?: string): Promise<ListModelsResult> {
    const key = apiKeyOverride?.trim() || this.getApiKey();
    if (!key) return { success: false, models: [], error: 'Enter a key or save one before refreshing models.' };
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      this.logGemini('REQUEST', { operation: 'models.list', pageSize: 100 }, key);
      const pager = await ai.models.list({ config: { pageSize: 100, httpOptions: { timeout: 15000, retryOptions: { attempts: 1 } } } });
      const models: AvailableModel[] = [];
      for await (const model of pager) {
        const id = model.name?.replace(/^models\//, '');
        if (!id?.startsWith('gemini-') || !model.supportedActions?.includes('generateContent') || /image|tts|audio|live|robotics|computer-use|transcribe|omni/i.test(id)) continue;
        models.push({ id, name: model.displayName || id, description: model.description || 'Gemini text model' });
      }
      const availableModels = [...new Map(models.map(m => [m.id, m])).values()].sort((a, b) => a.name.localeCompare(b.name));
      this.logGemini('RESPONSE', { operation: 'models.list', models: availableModels }, key);
      return { success: true, models: availableModels };
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      this.logGemini('ERROR', { operation: 'models.list', message: raw }, key);
      return { success: false, models: [], error: this.sanitizeErrorMessage(new Error(raw.split(key).join('[REDACTED]'))) };
    }
  }

  public getApiKey(): string | null {
    return secretsService.getKey();
  }

  public async generateSpeech(request: GenerateSpeechRequest): Promise<{ data: Buffer; mimeType: string }> {
    const key = this.getApiKey();
    if (!key) throw new Error('Gemini API key is missing. Please configure your API key in Settings.');

    const model = request.model || 'gemini-3.8-flash-lite-tts';
    const voice = request.voice || 'Kore';
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const payload = {
        model,
        input: [{
          type: 'user_input' as const,
          content: [{ type: 'text' as const, text: request.text }]
        }],
        response_format: { type: 'audio' as const },
        generation_config: {
          speech_config: [{ voice, language: request.language }]
        },
        store: false,
        stream: false
      };
      this.logGemini('REQUEST', {
        operation: 'interactions.create', model, text: request.text,
        language: request.language, voice, responseFormat: payload.response_format
      }, key);

      const response = await ai.interactions.create(payload, {
        timeout_ms: 30000,
        retries: { strategy: 'none' }
      });
      const audio = 'output_audio' in response ? response.output_audio : undefined;
      if (!audio?.data) {
        throw new Error('Gemini did not return pronunciation audio.');
      }
      const data = Buffer.from(audio.data, 'base64');
      if (data.length < 12 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE') {
        throw new Error('Gemini returned an unsupported pronunciation audio format.');
      }
      this.logGemini('RESPONSE', {
        operation: 'interactions.create', model, mimeType: audio.mime_type ?? 'audio/wav',
        sampleRate: audio.sample_rate, byteLength: data.length
      }, key);
      return { data, mimeType: 'audio/wav' };
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      this.logGemini('ERROR', { operation: 'interactions.create', model, message: raw }, key);
      throw new Error(`Gemini pronunciation request failed: ${this.sanitizeErrorMessage(raw.split(key).join('[REDACTED]'))}`);
    }
  }

  public async testConnection(modelOverride?: string, apiKeyOverride?: string): Promise<TestConnectionResult> {
    const key = apiKeyOverride?.trim() || this.getApiKey();
    if (!key) return { success: false, message: 'Enter a Gemini API key or save one first.' };
    const model = modelOverride || settingsService.getModel();
    const startTime = Date.now();
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const request = {
        model,
        contents: 'Reply with exactly OK.',
        config: { maxOutputTokens: 64, httpOptions: { timeout: 15000, retryOptions: { attempts: 1 } } }
      };
      this.logGemini('REQUEST', { operation: 'models.generateContent', ...request }, key);
      const response = await ai.models.generateContent(request);
      this.logGemini('RESPONSE', { operation: 'models.generateContent', model, text: response.text ?? '' }, key);
      if (!response.text?.trim()) return { success: false, message: 'Gemini returned no text. Try another model.' };
      return {
        success: true,
        message: `Gemini accepted the key and responded using ${model}. ${apiKeyOverride ? 'The entered key was tested without saving it.' : 'Your saved key was tested.'}`,
        modelUsed: model,
        latencyMs: Date.now() - startTime
      };
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      this.logGemini('ERROR', { operation: 'models.generateContent', model, message: raw }, key);
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
        const request = {
          model,
          contents: req.prompt,
          config: {
            systemInstruction: req.systemInstruction,
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        };
        this.logGemini('REQUEST', { operation: 'models.generateContent', systemInstruction: req.systemInstruction, ...request }, key);
        const response = await ai.models.generateContent(request);
        rawText = response.text || '';
        this.logGemini('RESPONSE', { operation: 'models.generateContent', model, text: rawText }, key);
      } catch (errGenAi) {
        this.logGemini('ERROR', { operation: 'models.generateContent', model, message: errGenAi instanceof Error ? errGenAi.message : String(errGenAi) }, key);
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
        this.logGemini('REQUEST', { sdk: '@google/generative-ai', operation: 'generateContent', model, systemInstruction: req.systemInstruction, prompt: req.prompt }, key);
        const result = await genModel.generateContent(req.prompt);
        rawText = result.response.text();
        this.logGemini('RESPONSE', { sdk: '@google/generative-ai', operation: 'generateContent', model, text: rawText }, key);
      }
    } catch (err: unknown) {
      this.logGemini('ERROR', { operation: 'models.generateContent', model, message: err instanceof Error ? err.message : String(err) }, key);
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
