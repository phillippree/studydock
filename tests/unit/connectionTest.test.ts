import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionTestSchema } from '../../src/main/gemini/connectionTest';
const mocks = vi.hoisted(() => ({ list: vi.fn(), generate: vi.fn(), create: vi.fn(), getKey: vi.fn() }));
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { list: mocks.list, generateContent: mocks.generate }; constructor(options: unknown) { mocks.create(options); } } }));
vi.mock('../../src/main/settings/secrets', () => ({ secretsService: { getKey: mocks.getKey } }));
vi.mock('../../src/main/settings/service', () => ({ settingsService: { getModel: () => 'test-model' } }));
import { GeminiClient } from '../../src/main/gemini/client';

describe('Gemini connection test', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getKey.mockReturnValue('FAKE-saved-key'); mocks.generate.mockResolvedValue({ text: 'OK' }); });
  it('discovers text models using an unsaved key and filters specialized models', async () => {
    mocks.list.mockResolvedValue((async function* () {
      yield { name: 'models/gemini-3.5-flash-lite', supportedActions: ['generateContent'] };
      yield { name: 'models/gemini-3.5-flash-lite', supportedActions: ['generateContent'] };
      yield { name: 'models/gemini-image', supportedActions: ['generateContent'] };
      yield { name: 'models/gemini-embedding', supportedActions: ['embedContent'] };
    })());
    const result = await new GeminiClient().listModels('FAKE-discovery-key');
    expect(result.success).toBe(true);
    expect(result.models.map(m => m.id)).toEqual(['gemini-3.5-flash-lite']);
    expect(mocks.getKey).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('redacts discovery errors and handles missing keys', async () => {
    mocks.list.mockRejectedValue(new Error('Rejected FAKE-discovery-key'));
    expect((await new GeminiClient().listModels('FAKE-discovery-key')).error).not.toContain('FAKE-discovery-key');
    mocks.getKey.mockReturnValue(null);
    expect((await new GeminiClient().listModels()).success).toBe(false);
  });
  it('tests an entered key without reading or replacing the saved key', async () => {
    const result = await new GeminiClient().testConnection('test-model', ' FAKE-entered-key ');
    expect(mocks.create).toHaveBeenCalledWith({ apiKey: 'FAKE-entered-key' });
    expect(mocks.getKey).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.message).toContain('without saving');
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate.mock.calls[0][0].config.httpOptions).toEqual({ timeout: 15000, retryOptions: { attempts: 1 } });
  });
  it('uses the saved key when none is entered', async () => {
    expect((await new GeminiClient().testConnection()).success).toBe(true);
    expect(mocks.create).toHaveBeenCalledWith({ apiKey: 'FAKE-saved-key' });
  });
  it('reports a missing key without calling Gemini', async () => {
    mocks.getKey.mockReturnValue(null);
    expect((await new GeminiClient().testConnection()).success).toBe(false);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('redacts the supplied key and does not retry a rejected request', async () => {
    mocks.generate.mockRejectedValue(new Error('Rejected FAKE-entered-key'));
    const result = await new GeminiClient().testConnection('test-model', 'FAKE-entered-key');
    expect(result.success).toBe(false);
    expect(result.message).not.toContain('FAKE-entered-key');
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
  it('reports an empty response', async () => {
    mocks.generate.mockResolvedValue({ text: '' });
    expect((await new GeminiClient().testConnection()).success).toBe(false);
  });
  it('rejects malformed bridge inputs', () => {
    for (const value of [null, { apiKey: 123 }, { apiKey: ' ' }, { model: '' }, { apiKey: 'a'.repeat(513) }, { unknown: true }]) {
      expect(connectionTestSchema.safeParse(value).success).toBe(false);
    }
    expect(connectionTestSchema.parse({ apiKey: ' FAKE-key ', model: ' test ' })).toEqual({ apiKey: 'FAKE-key', model: 'test' });
  });
});
