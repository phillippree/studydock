import { randomUUID } from 'node:crypto';
import { JokeExampleVoice, JokeListPage, JokeListQuery, JokeLookupChoice, JokeLookupResult, JokeSaveResult, JokeType } from '../../../shared/contracts/jokes';
import { GeminiClient } from '../../gemini/client';
import { SettingsService } from '../../settings/service';
import { JokesRepository } from './repository';
import { normalizeJokeText, validateJokeLookup } from './schema';
import { buildJokeLookupPrompt, buildJokeSystemInstruction } from './prompt';

export class JokesService {
  private readonly previews = new Map<string, { sourceText: string; text: string; normalizedText: string; type: JokeType; language: string; explanation: string; examples: Array<{ example: string; voice: JokeExampleVoice }>; expiresAt: number }>();

  constructor(private readonly repository: JokesRepository, private readonly gemini: GeminiClient, private readonly settings: SettingsService) {}

  public list(query: JokeListQuery = {}): JokeListPage {
    const offset = Number.isInteger(query.offset) && (query.offset || 0) >= 0 ? query.offset || 0 : 0;
    const limit = Number.isInteger(query.limit) ? Math.min(Math.max(query.limit || 1, 1), 50) : 6;
    return this.repository.list({ type: query.type, search: query.search?.trim().slice(0, 120), offset, limit });
  }

  public getById(id: string) { return this.repository.getById(id); }

  public async lookup(textInput: string, type: JokeType, languageInput = 'en'): Promise<JokeLookupResult> {
    const text = textInput.trim().replace(/\s+/g, ' ');
    const language = languageInput.trim() || 'en';
    if (!text) throw new Error('Enter a joke or punchline to look up.');
    if (text.length > 2000) throw new Error('Jokes and punchlines cannot exceed 2,000 characters.');
    if (type !== 'joke' && type !== 'punchline') throw new Error('Choose Joke or Punchline.');
    if (language.length > 20) throw new Error('Language code is too long.');
    const normalizedText = normalizeJokeText(text);
    const existing = this.repository.find(normalizedText, type, language);
    if (existing) return { status: 'duplicate', entry: existing };
    if (!this.gemini.getApiKey()) throw new Error('Add a Gemini API key in Home settings before looking up a joke.');

    const response = await this.gemini.generateStructured({
      prompt: buildJokeLookupPrompt(text, type, language),
      systemInstruction: buildJokeSystemInstruction(),
      modelOverride: this.settings.getModel(),
      schemaValidator: raw => validateJokeLookup(raw, text, type, language)
    });
    if (!response.recognized || !response.variations.length) return { status: 'unrecognized', text, suggestion: response.suggestion };

    this.removeExpiredPreviews();
    while (this.previews.size + response.variations.length > 50) {
      const oldest = this.previews.keys().next().value;
      if (!oldest) break;
      this.previews.delete(oldest);
    }
    const choices: JokeLookupChoice[] = response.variations.map(variation => {
      const token = randomUUID();
      const choice = { token, sourceText: text, text: variation.text, type, language, explanation: variation.explanation, examples: variation.examples };
      this.previews.set(token, { ...choice, normalizedText: normalizeJokeText(variation.text), expiresAt: Date.now() + 15 * 60 * 1000 });
      return choice;
    });
    return { status: 'choices', text, type, language, choices };
  }

  public savePreview(token: string): JokeSaveResult {
    this.removeExpiredPreviews();
    const preview = this.previews.get(token);
    if (!preview) throw new Error('This joke preview expired. Please look it up again.');
    const existing = this.repository.find(preview.normalizedText, preview.type, preview.language);
    if (existing) { this.previews.delete(token); return { status: 'duplicate', entry: existing }; }
    const entry = this.repository.save(preview);
    this.previews.delete(token);
    return { status: 'saved', entry };
  }

  private removeExpiredPreviews(): void {
    const now = Date.now();
    for (const [token, preview] of this.previews) if (preview.expiresAt <= now) this.previews.delete(token);
  }
}
