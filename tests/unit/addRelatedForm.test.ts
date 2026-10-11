import { describe, expect, it, vi } from 'vitest';
import { addRelatedFormToLibrary } from '../../src/renderer/shared/addRelatedForm';
import { StudyDockAPI } from '../../src/shared/contracts/ipc';
import { VocabWordWithDefinitions } from '../../src/shared/contracts/vocab';

const details: VocabWordWithDefinitions = {
  word: {
    id: 'word-tenacity', displayWord: 'tenacity', normalizedWord: 'tenacity',
    language: 'en', createdAt: '2026-10-09T00:00:00Z'
  },
  definitions: [],
  relatedForms: [],
  status: 'saved_locally'
};

describe('adding a related form from a vocabulary card', () => {
  it('verifies a new form, then opens its saved card', async () => {
    const bridge = {
      vocabVerifyAndAddWord: vi.fn().mockResolvedValue({ status: 'added', word: details.word, definitions: [] }),
      vocabGetWordDetails: vi.fn().mockResolvedValue(details)
    } satisfies Pick<StudyDockAPI, 'vocabVerifyAndAddWord' | 'vocabGetWordDetails'>;

    await expect(addRelatedFormToLibrary(bridge, 'tenacity', 'en')).resolves.toEqual({ status: 'opened', details, added: true });
    expect(bridge.vocabVerifyAndAddWord).toHaveBeenCalledWith({ word: 'tenacity', language: 'en' });
    expect(bridge.vocabGetWordDetails).toHaveBeenCalledWith('word-tenacity');
  });

  it('opens an existing library word without adding a duplicate', async () => {
    const bridge = {
      vocabVerifyAndAddWord: vi.fn().mockResolvedValue({ status: 'duplicate', word: details.word }),
      vocabGetWordDetails: vi.fn().mockResolvedValue(details)
    } satisfies Pick<StudyDockAPI, 'vocabVerifyAndAddWord' | 'vocabGetWordDetails'>;

    await expect(addRelatedFormToLibrary(bridge, 'tenacity', 'en')).resolves.toEqual({ status: 'opened', details, added: false });
  });

  it('keeps an unverified form out of the library and shows the suggestions', async () => {
    const bridge = {
      vocabVerifyAndAddWord: vi.fn().mockResolvedValue({ status: 'suggestions', enteredWord: 'tenaciti', suggestions: ['tenacity'] }),
      vocabGetWordDetails: vi.fn()
    } satisfies Pick<StudyDockAPI, 'vocabVerifyAndAddWord' | 'vocabGetWordDetails'>;

    const result = await addRelatedFormToLibrary(bridge, 'tenaciti', 'en');
    expect(result).toMatchObject({ status: 'error' });
    if (result.status === 'error') expect(result.message).toContain('tenacity');
    expect(bridge.vocabGetWordDetails).not.toHaveBeenCalled();
  });

  it('reports when a saved word cannot be reopened', async () => {
    const bridge = {
      vocabVerifyAndAddWord: vi.fn().mockResolvedValue({ status: 'added', word: details.word, definitions: [] }),
      vocabGetWordDetails: vi.fn().mockResolvedValue(null)
    } satisfies Pick<StudyDockAPI, 'vocabVerifyAndAddWord' | 'vocabGetWordDetails'>;

    await expect(addRelatedFormToLibrary(bridge, 'tenacity', 'en')).resolves.toMatchObject({
      status: 'error', message: expect.stringContaining('Find it in Word Library')
    });
  });
});
