import { describe, expect, it } from 'vitest';
import { decodeMuLawPcm } from '../../src/renderer/modes/vocab/pronunciationAudio';

describe('μ-law pronunciation decoding', () => {
  it('decodes silence and both signal polarities into normalized samples', () => {
    const samples = decodeMuLawPcm(new Uint8Array([0xff, 0x7f, 0x00, 0x80]));

    expect(samples[0]).toBe(0);
    expect(samples[1]).toBe(0);
    expect(samples[2]).toBeLessThan(-0.9);
    expect(samples[3]).toBeGreaterThan(0.9);
    expect([...samples].every(sample => sample >= -1 && sample <= 1)).toBe(true);
  });
});
