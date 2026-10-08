import { randomUUID } from 'node:crypto';
import { ConnectorCategory, ConnectorEntry, ConnectorListPage, ConnectorListQuery, ConnectorLookupResult, ConnectorSaveResult } from '../../../shared/contracts/connectors';
import { GeminiClient } from '../../gemini/client';
import { SettingsService } from '../../settings/service';
import { buildConnectorExamplesRefreshPrompt, buildConnectorLookupPrompt, buildConnectorSystemInstruction } from './prompt';
import { normalizeConnector, validateConnectorLookup } from './schema';
import { ConnectorsRepository } from './repository';

export class ConnectorsService {
  private readonly pendingPreviews = new Map<string, {
    connector: string;
    normalizedConnector: string;
    category: ConnectorCategory;
    language: string;
    meaning: string;
    examples: Array<{ example: string; voice: 'active' | 'passive' | 'other' }>;
    expiresAt: number;
  }>();

  constructor(private readonly repository: ConnectorsRepository, private readonly gemini: GeminiClient, private readonly settings: SettingsService) {}

  public list(query: ConnectorListQuery = {}): ConnectorListPage {
    const offset = Number.isInteger(query.offset) && (query.offset || 0) >= 0 ? query.offset || 0 : 0;
    const limit = Number.isInteger(query.limit) ? Math.min(Math.max(query.limit || 1, 1), 50) : 6;
    return this.repository.list({ category: query.category, search: query.search?.trim().slice(0, 120), offset, limit });
  }

  public async lookup(connectorInput: string, languageInput = 'en'): Promise<ConnectorLookupResult> {
    const connector = connectorInput.trim().replace(/\s+/g, ' ');
    const language = languageInput.trim() || 'en';
    if (!connector) throw new Error('Enter a connector to look up.');
    if (connector.length > 120) throw new Error('Connectors cannot exceed 120 characters.');
    if (language.length > 20) throw new Error('Language code is too long.');
    const normalizedConnector = normalizeConnector(connector);
    const existing = this.repository.find(normalizedConnector, language);
    if (existing) return { status: 'duplicate', entry: existing };
    if (!this.gemini.getApiKey()) throw new Error('Add a Gemini API key in Home settings before looking up a connector.');

    const response = await this.gemini.generateStructured({
      prompt: buildConnectorLookupPrompt(connector, language),
      systemInstruction: buildConnectorSystemInstruction(),
      modelOverride: this.settings.getModel(),
      schemaValidator: raw => validateConnectorLookup(raw, connector, language)
    });
    if (!response.recognized || !response.meaning) return { status: 'unrecognized', connector, suggestions: response.suggestions };
    const racedDuplicate = this.repository.find(normalizedConnector, language);
    if (racedDuplicate) return { status: 'duplicate', entry: racedDuplicate };

    this.removeExpiredPreviews();
    while (this.pendingPreviews.size >= 50) {
      const oldest = this.pendingPreviews.keys().next().value;
      if (!oldest) break;
      this.pendingPreviews.delete(oldest);
    }
    const token = randomUUID();
    this.pendingPreviews.set(token, {
      connector, normalizedConnector, category: response.category, language, meaning: response.meaning,
      examples: response.examples, expiresAt: Date.now() + 15 * 60 * 1000
    });
    return { status: 'preview', token, connector, category: response.category, language, meaning: response.meaning, examples: response.examples };
  }

  public savePreview(token: string): ConnectorSaveResult {
    this.removeExpiredPreviews();
    const preview = this.pendingPreviews.get(token);
    if (!preview) throw new Error('This connector preview expired. Please look it up again.');
    const existing = this.repository.find(preview.normalizedConnector, preview.language);
    if (existing) { this.pendingPreviews.delete(token); return { status: 'duplicate', entry: existing }; }
    try {
      const entry = this.repository.save({ ...preview, examples: preview.examples });
      this.pendingPreviews.delete(token);
      return { status: 'saved', entry };
    } catch (error: unknown) {
      const duplicate = this.repository.find(preview.normalizedConnector, preview.language);
      if (duplicate) { this.pendingPreviews.delete(token); return { status: 'duplicate', entry: duplicate }; }
      throw error;
    }
  }

  public async refreshExamples(id: string): Promise<ConnectorEntry> {
    const existing = this.repository.getById(id);
    if (!existing) throw new Error('This connector is no longer in your library.');
    if (!this.gemini.getApiKey()) throw new Error('Add a Gemini API key in Home settings before refreshing examples.');
    const response = await this.gemini.generateStructured({
      prompt: buildConnectorExamplesRefreshPrompt(existing.connector, existing.category, existing.meaning, existing.language),
      systemInstruction: buildConnectorSystemInstruction(),
      modelOverride: this.settings.getModel(),
      schemaValidator: raw => validateConnectorLookup(raw, existing.connector, existing.language, existing.category)
    });
    if (!response.recognized || !response.meaning) throw new Error('Gemini could not verify this connector while refreshing examples. Your saved examples were kept.');
    const updated = this.repository.replaceExamples(id, response.examples);
    if (!updated) throw new Error('This connector was removed before its examples could be saved.');
    return updated;
  }

  private removeExpiredPreviews(): void {
    const now = Date.now();
    for (const [token, preview] of this.pendingPreviews) if (preview.expiresAt <= now) this.pendingPreviews.delete(token);
  }
}
