import { describe, it, expect } from 'vitest';
import { validateAndNormalizeVocabResponse } from '../../src/main/modes/vocab/schema';

describe('Gemini Vocabulary Response Validation', () => {
  it('validates a correct recognized word response', () => {
    const raw = {
      word: 'lucid',
      language: 'en',
      recognized: true,
      senses: [
        {
          partOfSpeech: 'adjective',
          definition: 'Clear and easy to understand.',
          example: 'She gave a lucid explanation.'
        }
      ]
    };

    const validated = validateAndNormalizeVocabResponse(raw, 'lucid', 'en');
    expect(validated.recognized).toBe(true);
    expect(validated.word).toBe('lucid');
    expect(validated.senses).toHaveLength(1);
    expect(validated.senses[0].partOfSpeech).toBe('adjective');
    expect(validated.senses[0].definition).toBe('Clear and easy to understand.');
  });

  it('validates and handles an unrecognized word', () => {
    const raw = {
      word: 'asdfghjklqwerty',
      language: 'en',
      recognized: false,
      senses: []
    };

    const validated = validateAndNormalizeVocabResponse(raw, 'asdfghjklqwerty', 'en');
    expect(validated.recognized).toBe(false);
    expect(validated.senses).toEqual([]);
  });

  it('rejects a recognized response that has empty senses', () => {
    const raw = {
      word: 'lucid',
      language: 'en',
      recognized: true,
      senses: []
    };

    expect(() => validateAndNormalizeVocabResponse(raw, 'lucid', 'en')).toThrow(
      /Recognized word response must contain at least one sense/
    );
  });

  it('rejects an invalid part of speech', () => {
    const raw = {
      word: 'lucid',
      language: 'en',
      recognized: true,
      senses: [
        {
          partOfSpeech: 'invalid_pos_type',
          definition: 'Clear and easy to understand.',
          example: 'She gave a lucid explanation.'
        }
      ]
    };

    expect(() => validateAndNormalizeVocabResponse(raw, 'lucid', 'en')).toThrow();
  });

  it('rejects completely mismatched words', () => {
    const raw = {
      word: 'banana',
      language: 'en',
      recognized: true,
      senses: [
        {
          partOfSpeech: 'noun',
          definition: 'A long curved fruit.',
          example: 'He ate a banana.'
        }
      ]
    };

    expect(() => validateAndNormalizeVocabResponse(raw, 'resilient', 'en')).toThrow(
      /does not match requested word/
    );
  });
});
