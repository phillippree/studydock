export function decodeMuLawPcm(encoded: Uint8Array): Float32Array {
  const samples = new Float32Array(encoded.length);
  for (let index = 0; index < encoded.length; index += 1) {
    const value = (~encoded[index]) & 0xff;
    let sample = ((value & 0x0f) << 3) + 0x84;
    sample <<= (value & 0x70) >> 4;
    sample = (value & 0x80) ? 0x84 - sample : sample - 0x84;
    samples[index] = sample / 32768;
  }
  return samples;
}
