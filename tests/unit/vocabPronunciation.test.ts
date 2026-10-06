import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { VocabPronunciationService } from '../../src/main/modes/vocab/pronunciation';
import { VocabWord } from '../../src/shared/contracts/vocab';

function makeWav(): Buffer {
  const samples = Buffer.alloc(2400 * 2);
  for (let i = 0; i < 2400; i++) samples.writeInt16LE(Math.round(Math.sin(i / 12) * 12000), i * 2);
  const wav = Buffer.alloc(44 + samples.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples.length, 40); samples.copy(wav, 44);
  return wav;
}

describe('Vocabulary pronunciation cache', () => {
  let temporaryRoot = '';

  afterEach(async () => {
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
    temporaryRoot = '';
  });

  async function createService() {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'studydock-pronunciation-'));
    const word: VocabWord = {
      id: 'word-1', displayWord: 'resilient', normalizedWord: 'resilient',
      language: 'en', createdAt: '2026-01-01T00:00:00.000Z'
    };
    const repository = { findWordById: vi.fn<(id: string) => VocabWord | null>(() => word) };
    const generatedAudio = { data: makeWav(), mimeType: 'audio/wav' };
    const gemini = { generateSpeech: vi.fn().mockResolvedValue(generatedAudio) };
    const service = new VocabPronunciationService(repository, gemini, () => temporaryRoot);
    return { service, repository, gemini, generatedAudio };
  }

  it('generates and caches only compressed μ-law audio for offline replay', async () => {
    const { service, gemini, generatedAudio } = await createService();
    const first = await service.getPronunciation('word-1');
    const files = await readdir(temporaryRoot);
    const saved = await readFile(path.join(temporaryRoot, files[0]));

    expect(first.cached).toBe(false);
    expect(first.mimeType).toBe('audio/mulaw');
    expect(first.sampleRate).toBe(8000);
    expect(saved).toEqual(Buffer.from(first.data, 'base64'));
    expect(saved.length).toBe(800);
    expect(saved.length).toBeLessThan(generatedAudio.data.length / 5);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.ulaw$/);

    const second = await service.getPronunciation('word-1');
    expect(second.cached).toBe(true);
    expect(second.data).toBe(first.data);
    expect(gemini.generateSpeech).toHaveBeenCalledTimes(1);
  });

  it('does not save invalid WAV audio', async () => {
    const { service, gemini } = await createService();
    vi.mocked(gemini.generateSpeech).mockResolvedValueOnce({
      data: Buffer.from('RIFF uncompressed wav'), mimeType: 'audio/wav'
    });

    await expect(service.getPronunciation('word-1')).rejects.toThrow('invalid WAV');
    expect(await readdir(temporaryRoot)).toEqual([]);
  });

  it('deduplicates concurrent requests for the same word', async () => {
    const { service, gemini } = await createService();
    let resolveGeneration: ((value: { data: Buffer; mimeType: string }) => void) | undefined;
    vi.mocked(gemini.generateSpeech).mockImplementationOnce(() => new Promise(resolve => {
      resolveGeneration = resolve;
    }));

    const first = service.getPronunciation('word-1');
    const second = service.getPronunciation('word-1');
    await vi.waitFor(() => expect(gemini.generateSpeech).toHaveBeenCalledTimes(1));
    resolveGeneration?.({ data: makeWav(), mimeType: 'audio/wav' });

    const results = await Promise.all([first, second]);
    expect(results[0].data).toBe(results[1].data);
    expect(gemini.generateSpeech).toHaveBeenCalledTimes(1);
  });

  it('does not synthesize a word that no longer exists', async () => {
    const { service, repository, gemini } = await createService();
    vi.mocked(repository.findWordById).mockReturnValueOnce(null);

    await expect(service.getPronunciation('deleted-word')).rejects.toThrow('no longer in your library');
    expect(gemini.generateSpeech).not.toHaveBeenCalled();
  });
});
