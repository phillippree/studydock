import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { VocabPronunciationAudio } from '../../../shared/contracts/vocab';
import { GeminiClient } from '../../gemini/client';
import { storagePaths } from '../../storage/paths';
import { VocabRepository } from './repository';
import { encodeWavToMuLaw8k } from './audioEncoding';

const SPEECH_MODEL = 'gemini-3.8-flash-lite-tts';
const SPEECH_VOICE = 'Kore';
const SPEECH_SAMPLE_RATE = 8000;
const MULAW_MIME_TYPE = 'audio/mulaw';

type SpeechGenerator = Pick<GeminiClient, 'generateSpeech'>;
type WordLookup = Pick<VocabRepository, 'findWordById'>;

export class VocabPronunciationService {
  private readonly inFlight = new Map<string, Promise<VocabPronunciationAudio>>();

  constructor(
    private readonly repository: WordLookup,
    private readonly gemini: SpeechGenerator,
    private readonly cacheDirectory: () => string = () => storagePaths.getVocabPronunciationDir()
  ) {}

  public async getPronunciation(wordId: string): Promise<VocabPronunciationAudio> {
    const word = this.repository.findWordById(wordId);
    if (!word) throw new Error('This word is no longer in your library.');

    const cacheKey = createHash('sha256')
      .update(JSON.stringify([word.normalizedWord, word.language, SPEECH_MODEL, SPEECH_VOICE, SPEECH_SAMPLE_RATE, MULAW_MIME_TYPE, 2]))
      .digest('hex');
    const existing = this.inFlight.get(cacheKey);
    if (existing) return existing;

    const request = this.loadOrGenerate(word.displayWord, word.language, cacheKey);
    this.inFlight.set(cacheKey, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  private async loadOrGenerate(text: string, language: string, cacheKey: string): Promise<VocabPronunciationAudio> {
    const directory = this.cacheDirectory();
    const cachePath = path.join(directory, `${cacheKey}.ulaw`);

    try {
      const cachedData = await fs.readFile(cachePath);
      if (cachedData.length > 0) {
        return { data: cachedData.toString('base64'), mimeType: 'audio/mulaw', sampleRate: SPEECH_SAMPLE_RATE, cached: true };
      }
      await fs.rm(cachePath, { force: true });
    } catch (error: unknown) {
      if (!this.isNotFound(error)) throw error;
    }

    const generated = await this.gemini.generateSpeech({
      text,
      language,
      model: SPEECH_MODEL,
      voice: SPEECH_VOICE
    });
    if (generated.mimeType !== 'audio/wav') throw new Error('Gemini returned an unsupported pronunciation audio format.');
    const compressed = encodeWavToMuLaw8k(generated.data);

    await fs.mkdir(directory, { recursive: true });
    const temporaryPath = path.join(directory, `.${cacheKey}.${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporaryPath, compressed, { flag: 'wx', mode: 0o600 });
      await fs.rename(temporaryPath, cachePath);
    } catch (error: unknown) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }

    return { data: compressed.toString('base64'), mimeType: 'audio/mulaw', sampleRate: SPEECH_SAMPLE_RATE, cached: false };
  }

  private isNotFound(error: unknown): boolean {
    return !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
  }
}
