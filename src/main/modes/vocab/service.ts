import { VocabRepository } from './repository';
import { GeminiClient } from '../../gemini/client';
import { SettingsService } from '../../settings/service';
import { buildVocabSystemInstruction, buildVocabUserPrompt, VOCAB_PROMPT_VERSION } from './prompt';
import { normalizeWord, validateAndNormalizeVocabResponse } from './schema';
import {
  AddDefinitionInput,
  AddWordInput,
  EditDefinitionInput,
  EditWordInput,
  ExportData,
  GeminiVocabResponse,
  ImportWordsResult,
  VocabDefinition,
  VocabExample,
  VocabWord,
  VocabWordWithDefinitions,
  VerifyAndAddWordResult
} from '../../../shared/contracts/vocab';

export class VocabService {
  private inFlightRequests = new Map<string, Promise<VocabWordWithDefinitions>>();
  private inFlightVerifiedAdds = new Map<string, Promise<VerifyAndAddWordResult>>();

  constructor(
    private repository: VocabRepository,
    private gemini: GeminiClient,
    private settings: SettingsService
  ) {}

  public async getRandomWord(options?: { excludeWordId?: string }): Promise<VocabWordWithDefinitions | null> {
    const word = this.repository.getRandomWord(options?.excludeWordId);
    if (!word) return null;

    const definitions = this.repository.getDefinitionsForWord(word.id);
    if (definitions.length > 0) {
      return {
        word,
        definitions,
        status: 'saved_locally'
      };
    }

    // No saved definitions yet -> try to fetch from Gemini
    return this.fetchDefinition(word.id, false);
  }

  public async getWordDetails(wordId: string): Promise<VocabWordWithDefinitions | null> {
    const word = this.repository.findWordById(wordId);
    if (!word) return null;

    const definitions = this.repository.getDefinitionsForWord(word.id);
    return {
      word,
      definitions,
      status: definitions.length > 0 ? 'saved_locally' : 'not_saved'
    };
  }

  public async getAllWords(): Promise<Array<VocabWord & { definitionCount: number }>> {
    return this.repository.getAllWords();
  }

  public async fetchDefinition(wordId: string, forceRefresh = false): Promise<VocabWordWithDefinitions> {
    const word = this.repository.findWordById(wordId);
    if (!word) {
      throw new Error(`Word with ID "${wordId}" does not exist.`);
    }

    const existingDefinitions = this.repository.getDefinitionsForWord(wordId);
    if (!forceRefresh && existingDefinitions.length > 0) {
      return {
        word,
        definitions: existingDefinitions,
        status: 'saved_locally'
      };
    }

    // Check if an in-flight request is already active for this word to prevent duplicate concurrent calls
    if (this.inFlightRequests.has(wordId)) {
      return this.inFlightRequests.get(wordId)!;
    }

    const requestPromise = this.executeFetchDefinition(word, forceRefresh, existingDefinitions);
    this.inFlightRequests.set(wordId, requestPromise);

    try {
      return await requestPromise;
    } finally {
      this.inFlightRequests.delete(wordId);
    }
  }

  private async executeFetchDefinition(
    word: VocabWord,
    _forceRefresh: boolean,
    existingDefinitions: VocabDefinition[]
  ): Promise<VocabWordWithDefinitions> {
    const apiKey = this.gemini.getApiKey();
    if (!apiKey) {
      return {
        word,
        definitions: existingDefinitions,
        status: existingDefinitions.length > 0 ? 'saved_locally' : 'not_saved',
        generationError: 'Gemini API key is not configured. Please add your key in Settings.'
      };
    }

    const model = this.settings.getModel();
    const systemInstruction = buildVocabSystemInstruction();
    const prompt = buildVocabUserPrompt({ word: word.displayWord, language: word.language });

    try {
      const response = await this.gemini.generateStructured({
        prompt,
        systemInstruction,
        modelOverride: model,
        schemaValidator: raw => validateAndNormalizeVocabResponse(raw, word.normalizedWord, word.language)
      });

      // Verify that the word still exists and has not been edited or deleted while request was in-flight
      const currentWord = this.repository.findWordById(word.id);
      if (!currentWord || currentWord.normalizedWord !== word.normalizedWord || currentWord.language !== word.language) {
        // The word was deleted or modified during generation; discard the stale result
        return {
          word,
          definitions: existingDefinitions,
          status: 'error',
          generationError: 'The word was modified or deleted while generation was in progress.'
        };
      }

      if (!response.recognized || response.senses.length === 0) {
        return {
          word: currentWord,
          definitions: existingDefinitions,
          status: 'unrecognized',
          generationError: `"${word.displayWord}" was not recognized as a valid lexical term by Gemini.`
        };
      }

      // Save definitions in a database transaction
      try {
        const savedDefinitions = this.repository.replaceDefinitions(
          word.id,
          response.senses.map(sense => ({
            partOfSpeech: sense.partOfSpeech,
            definition: sense.definition,
            example: sense.examples[0]?.example || '',
            examples: sense.examples.map((item, index) => ({ ...item, position: index + 1 })),
            synonyms: sense.synonyms,
            source: 'gemini',
            modelIdentifier: model,
            promptVersion: VOCAB_PROMPT_VERSION
          }))
        );

        return {
          word: currentWord,
          definitions: savedDefinitions,
          status: 'generated_gemini'
        };
      } catch (saveError: unknown) {
        // If Gemini succeeded but DB save failed, present the senses with 'not_saved' status so user can retry save
        const msg = saveError instanceof Error ? saveError.message : 'Database save failed';
        return {
          word: currentWord,
          definitions: response.senses.map((s, idx) => ({
            id: `temp_${idx}`,
            wordId: word.id,
            partOfSpeech: s.partOfSpeech as VocabDefinition['partOfSpeech'],
            definition: s.definition,
            example: s.examples[0]?.example || '',
            examples: s.examples.map((item, index) => ({ ...item, position: index + 1 })),
            synonyms: s.synonyms,
            source: 'gemini',
            modelIdentifier: model,
            promptVersion: VOCAB_PROMPT_VERSION,
            generatedAt: new Date().toISOString()
          })),
          status: 'not_saved',
          generationError: `Definitions were generated but could not be saved to the database: ${msg}. Click 'Retry Save' to persist them.`
        };
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Generation failed';
      // If refresh failed, preserve existing definitions intact!
      return {
        word,
        definitions: existingDefinitions,
        status: existingDefinitions.length > 0 ? 'saved_locally' : 'error',
        generationError: errorMsg
      };
    }
  }

  public async saveDefinitionRetry(
    wordId: string,
    senses: Array<{ partOfSpeech: string; definition: string; example: string; examples?: VocabExample[]; synonyms?: string[]; source?: string }>
  ): Promise<VocabWordWithDefinitions> {
    const word = this.repository.findWordById(wordId);
    if (!word) {
      throw new Error(`Word with ID "${wordId}" not found.`);
    }

    const saved = this.repository.replaceDefinitions(
      wordId,
      senses.map(s => ({
        partOfSpeech: s.partOfSpeech,
        definition: s.definition,
        example: s.example,
        examples: s.examples,
        synonyms: s.synonyms,
        source: s.source || 'gemini',
        modelIdentifier: this.settings.getModel(),
        promptVersion: VOCAB_PROMPT_VERSION
      }))
    );

    return {
      word,
      definitions: saved,
      status: 'saved_locally'
    };
  }

  public async addWord(input: AddWordInput): Promise<{ word: VocabWord; isDuplicate: boolean }> {
    const trimmed = input.word.trim();
    if (!trimmed) {
      throw new Error('Word cannot be blank.');
    }

    const language = input.language?.trim() || 'en';
    const normalized = normalizeWord(trimmed);

    // Duplicate check
    const existing = this.repository.findWordByNormalized(normalized, language);
    if (existing) {
      return {
        word: existing,
        isDuplicate: true
      };
    }

    const created = this.repository.createWord(trimmed, normalized, language);
    return {
      word: created,
      isDuplicate: false
    };
  }

  public async verifyAndAddWord(input: AddWordInput): Promise<VerifyAndAddWordResult> {
    const displayWord = input.word.trim();
    if (!displayWord) throw new Error('Word cannot be blank.');
    if (displayWord.length > 100) throw new Error('Word or phrase cannot exceed 100 characters.');

    const language = input.language?.trim() || 'en';
    const normalizedWord = normalizeWord(displayWord);
    const existing = this.repository.findWordByNormalized(normalizedWord, language);
    if (existing) return { status: 'duplicate', word: existing };

    const requestKey = `${language}:${normalizedWord}`;
    const pending = this.inFlightVerifiedAdds.get(requestKey);
    if (pending) return pending;

    const request = this.executeVerifyAndAddWord(displayWord, normalizedWord, language);
    this.inFlightVerifiedAdds.set(requestKey, request);
    try {
      return await request;
    } finally {
      if (this.inFlightVerifiedAdds.get(requestKey) === request) {
        this.inFlightVerifiedAdds.delete(requestKey);
      }
    }
  }

  private async executeVerifyAndAddWord(
    displayWord: string,
    normalizedWord: string,
    language: string
  ): Promise<VerifyAndAddWordResult> {
    if (!this.gemini.getApiKey()) {
      throw new Error('Add a Gemini API key in Home settings before verifying a new word.');
    }

    const model = this.settings.getModel();
    let response: GeminiVocabResponse;
    try {
      response = await this.gemini.generateStructured({
        prompt: buildVocabUserPrompt({ word: displayWord, language }),
        systemInstruction: buildVocabSystemInstruction(),
        modelOverride: model,
        schemaValidator: raw => validateAndNormalizeVocabResponse(raw, normalizedWord, language)
      });
    } catch (error: unknown) {
      return {
        status: 'error',
        enteredWord: displayWord,
        message: error instanceof Error ? error.message : 'Gemini could not check this word. Please try again.'
      };
    }

    if (!response.recognized) {
      if (response.suggestions?.length) {
        return { status: 'suggestions', enteredWord: displayWord, suggestions: response.suggestions };
      }
      return { status: 'unrecognized', enteredWord: displayWord };
    }

    const existing = this.repository.findWordByNormalized(normalizedWord, language);
    if (existing) return { status: 'duplicate', word: existing };

    try {
      const saved = this.repository.createWordWithDefinitions(
        displayWord,
        normalizedWord,
        language,
        response.senses.map(sense => ({
          partOfSpeech: sense.partOfSpeech,
          definition: sense.definition,
          examples: sense.examples,
          synonyms: sense.synonyms,
          source: 'gemini',
          modelIdentifier: model,
          promptVersion: VOCAB_PROMPT_VERSION
        }))
      );
      return { status: 'added', ...saved };
    } catch (error: unknown) {
      const racedDuplicate = this.repository.findWordByNormalized(normalizedWord, language);
      if (racedDuplicate) return { status: 'duplicate', word: racedDuplicate };
      throw error;
    }
  }

  public async editWord(input: EditWordInput): Promise<VocabWord> {
    const trimmed = input.displayWord.trim();
    if (!trimmed) {
      throw new Error('Word cannot be blank.');
    }

    const language = input.language?.trim() || 'en';
    const normalized = normalizeWord(trimmed);

    const result = this.repository.updateWord(input.id, trimmed, normalized, language);
    return result.word;
  }

  public async deleteWord(wordId: string): Promise<{ success: boolean; deletedWord: VocabWord }> {
    const deleted = this.repository.deleteWord(wordId);
    if (!deleted) {
      throw new Error(`Word with ID "${wordId}" does not exist.`);
    }
    return { success: true, deletedWord: deleted };
  }

  public async addDefinition(input: AddDefinitionInput): Promise<VocabDefinition> {
    const word = this.repository.findWordById(input.wordId);
    if (!word) {
      throw new Error(`Word with ID "${input.wordId}" not found.`);
    }
    return this.repository.addDefinition(
      input.wordId,
      input.partOfSpeech,
      input.definition.trim(),
      input.example.trim(),
      input.source || 'manual',
      input.examples,
      input.synonyms
    );
  }

  public async editDefinition(input: EditDefinitionInput): Promise<VocabDefinition> {
    const updated = this.repository.updateDefinition(
      input.id,
      input.partOfSpeech,
      input.definition.trim(),
      input.example.trim()
    );
    if (!updated) {
      throw new Error(`Definition with ID "${input.id}" not found.`);
    }
    return updated;
  }

  public async deleteDefinition(definitionId: string): Promise<{ success: boolean }> {
    const success = this.repository.deleteDefinition(definitionId);
    return { success };
  }

  public async importWords(content: string, language = 'en'): Promise<ImportWordsResult> {
    const lines = content.split(/\r?\n/);
    let imported = 0;
    let duplicates = 0;
    let rejected = 0;
    const errors: string[] = [];

    const cleanLang = language.trim() || 'en';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        continue;
      }

      // Check max length
      if (line.length > 100) {
        rejected++;
        errors.push(`Line ${i + 1}: Word exceeds 100 characters limit.`);
        continue;
      }

      const normalized = normalizeWord(line);
      if (!normalized) {
        rejected++;
        continue;
      }

      const existing = this.repository.findWordByNormalized(normalized, cleanLang);
      if (existing) {
        duplicates++;
      } else {
        try {
          this.repository.createWord(line, normalized, cleanLang);
          imported++;
        } catch (err: unknown) {
          rejected++;
          const msg = err instanceof Error ? err.message : 'DB error';
          errors.push(`Line ${i + 1} (${line}): ${msg}`);
        }
      }
    }

    return {
      imported,
      duplicates,
      rejected,
      total: lines.filter(l => l.trim().length > 0).length,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined
    };
  }

  public async exportData(): Promise<ExportData> {
    const all = this.repository.getAllWordsWithDefinitions();
    return {
      version: 1,
      appName: 'StudyDock',
      exportedAt: new Date().toISOString(),
      words: all.map(w => ({
        displayWord: w.displayWord,
        normalizedWord: w.normalizedWord,
        language: w.language,
        createdAt: w.createdAt,
        definitions: w.definitions.map(d => ({
          partOfSpeech: d.partOfSpeech,
          definition: d.definition,
          example: d.example,
          examples: d.examples.map(({ example, position, voice }) => ({ example, position, voice })),
          synonyms: d.synonyms,
          source: d.source,
          modelIdentifier: d.modelIdentifier,
          generatedAt: d.generatedAt
        }))
      }))
    };
  }
}
