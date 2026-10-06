import { describe, it, expect } from 'vitest';
import { normalizeWord } from '../../src/main/modes/vocab/schema';

describe('Word Normalization and Duplicate Prevention', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeWord('  hello  ')).toBe('hello');
    expect(normalizeWord('\tlucid\n')).toBe('lucid');
  });

  it('converts to lowercase', () => {
    expect(normalizeWord('Serendipity')).toBe('serendipity');
    expect(normalizeWord('EPHEMERAL')).toBe('ephemeral');
  });

  it('collapses internal multiple spaces', () => {
    expect(normalizeWord('ad   hoc')).toBe('ad hoc');
  });

  it('applies unicode NFKC normalization', () => {
    // Unicode full-width characters or composite accents
    const fullWidth = 'ｒｅｓｉｌｉｅｎｔ';
    expect(normalizeWord(fullWidth)).toBe('resilient');
  });
});
