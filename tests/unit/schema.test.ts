import { describe, it, expect } from 'vitest';
import { validateAndNormalizeVocabResponse } from '../../src/main/modes/vocab/schema';

const examples = (prefix: string) => [
  { example: `${prefix} example sentence number one.`, voice: 'active' },
  { example: `${prefix} example sentence number two.`, voice: 'passive' },
  { example: `${prefix} example sentence number three.`, voice: 'active' },
  { example: `${prefix} example sentence number four.`, voice: 'other' },
  { example: `${prefix} example sentence number five.`, voice: 'active' },
  { example: `${prefix} example sentence number six.`, voice: 'passive' }
];

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
          examples: examples('Lucid')
        }
      ]
    };

    const validated = validateAndNormalizeVocabResponse(raw, 'lucid', 'en');
    expect(validated.recognized).toBe(true);
    expect(validated.word).toBe('lucid');
    expect(validated.senses).toHaveLength(1);
    expect(validated.senses[0].partOfSpeech).toBe('adjective');
    expect(validated.senses[0].definition).toBe('Clear and easy to understand.');
    expect(validated.senses[0].examples).toHaveLength(6);
    expect(validated.senses[0].examples[1].voice).toBe('passive');
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
          examples: examples('Lucid')
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
          examples: examples('Banana')
        }
      ]
    };

    expect(() => validateAndNormalizeVocabResponse(raw, 'resilient', 'en')).toThrow(
      /does not match requested word/
    );
  });

  it('rejects a response that does not contain six distinct examples per sense', () => {
    const raw = {
      word: 'lucid',
      language: 'en',
      recognized: true,
      senses: [{
        partOfSpeech: 'adjective',
        definition: 'Clear and easy to understand.',
        examples: examples('Lucid').slice(0, 5)
      }]
    };

    expect(() => validateAndNormalizeVocabResponse(raw, 'lucid', 'en')).toThrow(/exactly six examples/);
  });
});
