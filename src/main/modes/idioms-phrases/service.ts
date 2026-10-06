import { ExpressionType, IdiomPhraseEntry, LookupExpressionResult } from '../../../shared/contracts/idiomsPhrases';
import { GeminiClient } from '../../gemini/client';
import { SettingsService } from '../../settings/service';
import { buildExpressionLookupPrompt, buildExpressionSystemInstruction } from './prompt';
import { normalizeExpression, validateExpressionLookup } from './schema';
import { IdiomsPhrasesRepository } from './repository';

export class IdiomsPhrasesService {
  constructor(
    private readonly repository: IdiomsPhrasesRepository,
    private readonly gemini: GeminiClient,
    private readonly settings: SettingsService
  ) {}

  public list(type?: ExpressionType): IdiomPhraseEntry[] {
    return this.repository.list(type);
  }

  public async lookupAndSave(expressionInput: string, type: ExpressionType, languageInput = 'en'): Promise<LookupExpressionResult> {
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
    try {
      return {
        status: 'saved',
        entry: this.repository.save({
          expression,
          normalizedExpression,
          type,
          language,
          meaning: response.meaning,
          examples: response.examples
        })
      };
    } catch (error: unknown) {
      const duplicate = this.repository.find(normalizedExpression, type, language);
      if (duplicate) return { status: 'duplicate', entry: duplicate };
      throw error;
    }
  }
}
