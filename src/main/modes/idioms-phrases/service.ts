import { randomUUID } from 'node:crypto';
import { ExpressionType, IdiomPhraseEntry, IdiomPhraseListPage, IdiomPhraseListQuery, IdiomPhraseQuizPrompt, LookupExpressionResult } from '../../../shared/contracts/idiomsPhrases';
import { GeminiClient } from '../../gemini/client';
import { SettingsService } from '../../settings/service';
import { buildExpressionExamplesRefreshPrompt, buildExpressionLookupPrompt, buildExpressionSystemInstruction } from './prompt';
import { normalizeExpression, validateExpressionLookup } from './schema';
import { IdiomsPhrasesRepository } from './repository';

export class IdiomsPhrasesService {
  private readonly pendingPreviews = new Map<string, {
    expression: string;
    normalizedExpression: string;
    type: ExpressionType;
    language: string;
    meaning: string;
    examples: Array<{ example: string; voice: 'active' | 'passive' | 'other' }>;
    expiresAt: number;
  }>();

  constructor(
    private readonly repository: IdiomsPhrasesRepository,
    private readonly gemini: GeminiClient,
    private readonly settings: SettingsService
  ) {}

  public list(query: IdiomPhraseListQuery = {}): IdiomPhraseListPage {
    const offset = Number.isInteger(query.offset) && (query.offset || 0) >= 0 ? query.offset || 0 : 0;
    const limit = Number.isInteger(query.limit) ? Math.min(Math.max(query.limit || 1, 1), 50) : 6;
    const search = query.search?.trim().slice(0, 120);
    return this.repository.list({ type: query.type, search, offset, limit });
  }

  public getRandomQuizPrompt(type?: ExpressionType, excludeId?: string): IdiomPhraseQuizPrompt | null {
    return this.repository.getRandomQuizPrompt(type, excludeId);
  }

  public revealQuizEntry(id: string): IdiomPhraseEntry {
    const entry = this.repository.getById(id);
    if (!entry) throw new Error('This expression is no longer in your library.');
    return entry;
  }

  public async refreshExamples(id: string): Promise<IdiomPhraseEntry> {
    const existing = this.repository.getById(id);
    if (!existing) throw new Error('This expression is no longer in your library.');
    if (!this.gemini.getApiKey()) throw new Error('Add a Gemini API key in Home settings before refreshing examples.');

    const response = await this.gemini.generateStructured({
      prompt: buildExpressionExamplesRefreshPrompt(existing.expression, existing.meaning, existing.language, existing.type),
      systemInstruction: buildExpressionSystemInstruction(),
      modelOverride: this.settings.getModel(),
      schemaValidator: raw => validateExpressionLookup(raw, existing.expression, existing.language, existing.type)
    });
    if (!response.recognized || !response.meaning) {
      throw new Error('Gemini could not verify this expression while refreshing its examples. Your saved examples were kept.');
    }

    const updated = this.repository.replaceExamples(id, response.examples);
    if (!updated) throw new Error('This expression was removed before its examples could be saved.');
    return updated;
  }

  public async lookup(expressionInput: string, type: ExpressionType, languageInput = 'en'): Promise<LookupExpressionResult> {
    const expression = expressionInput.trim().replace(/\s+/g, ' ');
    const language = languageInput.trim() || 'en';
    if (!expression) throw new Error('Enter an idiom or phrase to look up.');
    if (expression.length > 120) throw new Error('Expressions cannot exceed 120 characters.');
    if (!['idiom', 'phrase'].includes(type)) throw new Error('Choose Idiom or Phrase.');
    const normalizedExpression = normalizeExpression(expression);
    const existing = this.repository.find(normalizedExpression, type, language);
    if (existing) return { status: 'duplicate', entry: existing };
    if (!this.gemini.getApiKey()) throw new Error('Add a Gemini API key in Home settings before looking up an expression.');

    const model = this.settings.getModel();
    const response = await this.gemini.generateStructured({
      prompt: buildExpressionLookupPrompt(expression, language, type),
      systemInstruction: buildExpressionSystemInstruction(),
      modelOverride: model,
      schemaValidator: raw => validateExpressionLookup(raw, expression, language, type)
    });
    if (!response.recognized || !response.meaning) {
      return { status: 'unrecognized', expression, suggestion: response.suggestion };
    }

    const racedDuplicate = this.repository.find(normalizedExpression, type, language);
    if (racedDuplicate) return { status: 'duplicate', entry: racedDuplicate };

    this.removeExpiredPreviews();
    while (this.pendingPreviews.size >= 50) {
      const oldestToken = this.pendingPreviews.keys().next().value;
      if (!oldestToken) break;
      this.pendingPreviews.delete(oldestToken);
    }
    const token = randomUUID();
    this.pendingPreviews.set(token, {
      expression,
      normalizedExpression,
      type,
      language,
      meaning: response.meaning,
      examples: response.examples,
      expiresAt: Date.now() + 15 * 60 * 1000
    });
    return {
      status: 'preview',
      token,
      expression,
      type,
      language,
      meaning: response.meaning,
      examples: response.examples
    };
  }

  public savePreview(token: string): { status: 'saved' | 'duplicate'; entry: IdiomPhraseEntry } {
    this.removeExpiredPreviews();
    const preview = this.pendingPreviews.get(token);
    if (!preview) throw new Error('This lookup preview expired. Please look it up again.');

    const existing = this.repository.find(preview.normalizedExpression, preview.type, preview.language);
    if (existing) {
      this.pendingPreviews.delete(token);
      return { status: 'duplicate', entry: existing };
    }

    try {
      const entry = this.repository.save({
        expression: preview.expression,
        normalizedExpression: preview.normalizedExpression,
        type: preview.type,
        language: preview.language,
        meaning: preview.meaning,
        examples: preview.examples
      });
      this.pendingPreviews.delete(token);
      return { status: 'saved', entry };
    } catch (error: unknown) {
      const duplicate = this.repository.find(preview.normalizedExpression, preview.type, preview.language);
      if (duplicate) {
        this.pendingPreviews.delete(token);
        return { status: 'duplicate', entry: duplicate };
      }
      throw error;
    }
  }

  private removeExpiredPreviews(): void {
    const now = Date.now();
    for (const [token, preview] of this.pendingPreviews) {
      if (preview.expiresAt <= now) this.pendingPreviews.delete(token);
    }
  }
}
