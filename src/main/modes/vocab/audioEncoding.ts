/** Convert Gemini's default 24 kHz mono PCM WAV to compact 8 kHz G.711 μ-law. */
export function encodeWavToMuLaw8k(wav: Buffer): Buffer {
  if (wav.length < 12 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Gemini returned invalid WAV pronunciation audio.');
  }

  let format: { codec: number; channels: number; sampleRate: number; bits: number } | undefined;
  let samples: Buffer | undefined;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const id = wav.toString('ascii', offset, offset + 4);
    const length = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > wav.length) throw new Error('Gemini returned truncated WAV pronunciation audio.');
    if (id === 'fmt ') {
      if (length < 16) throw new Error('Gemini returned invalid WAV format metadata.');
      format = {
        codec: wav.readUInt16LE(start), channels: wav.readUInt16LE(start + 2),
        sampleRate: wav.readUInt32LE(start + 4), bits: wav.readUInt16LE(start + 14)
      };
    } else if (id === 'data') {
      samples = wav.subarray(start, end);
    }
    offset = end + (length % 2);
  }

  if (!format || format.codec !== 1 || format.channels !== 1 || format.sampleRate !== 24000 || format.bits !== 16 ||
      !samples || samples.length < 6 || samples.length % 2 !== 0) {
    throw new Error('Gemini returned an unsupported WAV pronunciation audio format.');
  }

  const output = Buffer.alloc(Math.floor(samples.length / 6));
  for (let i = 0; i < output.length; i++) {
    const offset = i * 6;
    const average = Math.round((samples.readInt16LE(offset) + samples.readInt16LE(offset + 2) + samples.readInt16LE(offset + 4)) / 3);
    output[i] = encodeMuLawSample(average);
  }
  return output;
}

function encodeMuLawSample(value: number): number {
  const sign = value < 0 ? 0x80 : 0;
  const biased = Math.min(Math.abs(value), 32635) + 0x84;
  let exponent = 7;
  for (let mask = 0x4000; exponent > 0 && (biased & mask) === 0; mask >>= 1) exponent--;
  const mantissa = (biased >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}
