import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Brain, Eye, EyeOff, ArrowRight, AlertCircle, BookOpen, RotateCw, Volume2 } from 'lucide-react';
import { VocabDefinition, VocabWord } from '../../../shared/contracts/vocab';
import { WordLibrary } from '../vocab/WordLibrary';
import { decodeMuLawPcm } from '../vocab/pronunciationAudio';

interface WordQuizPageProps {
  onNavigateHome: () => void;
}

export const WordQuizPage: React.FC<WordQuizPageProps> = () => {
  const [word, setWord] = useState<VocabWord | null>(null);
  const [definitions, setDefinitions] = useState<VocabDefinition[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [pronunciationLoading, setPronunciationLoading] = useState(false);
  const [pronunciationError, setPronunciationError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const pronunciationRequestRef = useRef(0);
  const activeWordIdRef = useRef<string | null>(null);

  const stopPronunciation = useCallback(() => {
    pronunciationRequestRef.current += 1;
    if (audioSourceRef.current) {
      audioSourceRef.current.onended = null;
      try { audioSourceRef.current.stop(); } catch { /* It may have already finished. */ }
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
    setPronunciationError(null);
    setPronunciationLoading(false);
  }, []);

  useEffect(() => () => {
    pronunciationRequestRef.current += 1;
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch { /* It may have already finished. */ }
      audioSourceRef.current.disconnect();
    }
    void audioContextRef.current?.close();
  }, []);

  const loadNext = useCallback(async (excludeWordId?: string) => {
    stopPronunciation();
    activeWordIdRef.current = null;
    setLoading(true);
    setError(null);
    setRefreshMessage(null);
    setRevealed(false);
    setDefinitions([]);
    try {
      const nextWord = await window.studydockBridge.wordQuizGetRandomWord(excludeWordId);
      activeWordIdRef.current = nextWord?.id ?? null;
      setWord(nextWord);
    } catch {
      setError('Could not load a quiz word. Please try again.');
      setWord(null);
    } finally {
      setLoading(false);
    }
  }, [stopPronunciation]);

  useEffect(() => { void loadNext(); }, [loadNext]);

  const playPronunciation = async () => {
    if (!word || pronunciationLoading) return;
    const wordId = word.id;
    const requestId = ++pronunciationRequestRef.current;
    setPronunciationLoading(true);
    setPronunciationError(null);
    try {
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      await context.resume();
      const pronunciation = await window.studydockBridge.vocabGetPronunciation(wordId);
      if (pronunciationRequestRef.current !== requestId || activeWordIdRef.current !== wordId) return;
      if (pronunciation.mimeType !== 'audio/mulaw' || pronunciation.sampleRate !== 8000) {
        throw new Error('Gemini returned an unsupported pronunciation format.');
      }
      const binary = atob(pronunciation.data);
      const encoded = Uint8Array.from(binary, character => character.charCodeAt(0));
      const samples = decodeMuLawPcm(encoded);
      const buffer = context.createBuffer(1, samples.length, pronunciation.sampleRate);
      buffer.getChannelData(0).set(samples);
      if (audioSourceRef.current) {
        try { audioSourceRef.current.stop(); } catch { /* It may have already finished. */ }
        audioSourceRef.current.disconnect();
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => {
        if (audioSourceRef.current === source) audioSourceRef.current = null;
      };
      audioSourceRef.current = source;
      source.start();
    } catch (error: unknown) {
      if (pronunciationRequestRef.current === requestId && activeWordIdRef.current === wordId) {
        setPronunciationError(error instanceof Error ? error.message : 'Could not play this pronunciation.');
      }
    } finally {
      if (pronunciationRequestRef.current === requestId && activeWordIdRef.current === wordId) setPronunciationLoading(false);
    }
  };

  const reveal = async () => {
    if (!word || revealed) return;
    setError(null);
    try {
      const answer = await window.studydockBridge.wordQuizRevealDefinition(word.id);
      setDefinitions(answer);
      setRevealed(true);
    } catch {
      setError('Could not reveal this definition. It may have been removed from your library.');
    }
  };

  const refreshDefinition = async () => {
    if (!word || !revealed || isRefreshing) return;
    const refreshingWordId = word.id;
    setIsRefreshing(true);
    setError(null);
    setRefreshMessage(null);
    try {
      const result = await window.studydockBridge.vocabFetchDefinition(refreshingWordId, true);
      if (result.status !== 'generated_gemini') {
        throw new Error(result.generationError || 'Gemini did not replace this definition. Your saved definition was kept.');
      }
      setDefinitions(result.definitions);
      setRefreshMessage('Definition and examples refreshed.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not refresh this definition.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const selectLibraryWord = async (wordId: string) => {
    stopPronunciation();
    activeWordIdRef.current = null;
    setLoading(true);
    setError(null);
    setRefreshMessage(null);
    setDefinitions([]);
    setRevealed(false);
    try {
      const selectedWord = await window.studydockBridge.wordQuizGetWord(wordId);
      if (!selectedWord) {
        setError('That word no longer has a saved definition. Choose another word or add a definition in Vocabulary.');
        setWord(null);
        return;
      }
      activeWordIdRef.current = selectedWord.id;
      setWord(selectedWord);
    } catch {
      setError('Could not load that word for the quiz. Please try again.');
      setWord(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="quiz-page">
      <div className="quiz-heading">
        <div className="quiz-heading-title">
          <span className="quiz-icon"><Brain size={22} /></span>
          <div><h1>Word Quiz</h1><p>Think of the meaning, then reveal the answer.</p></div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setIsLibraryOpen(true)} disabled={isRefreshing}>
          <BookOpen size={16} />Word Library
        </button>
      </div>

      {loading ? (
        <section className="card quiz-card" aria-live="polite"><div className="spinner" /><p>Finding a word…</p></section>
      ) : word ? (
        <section className="card quiz-card" aria-live="polite">
          <div className="quiz-eyebrow">YOUR WORD</div>
          <div className="quiz-word-row">
            <div className="quiz-word">{word.displayWord}</div>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => void playPronunciation()} disabled={pronunciationLoading || isRefreshing} title="Generate and play this word’s pronunciation with Gemini; audio is cached for offline replay" aria-label={`Play pronunciation of ${word.displayWord}`}>
              <Volume2 size={16} />{pronunciationLoading ? 'Generating audio…' : 'Hear pronunciation'}
            </button>
          </div>
          <div className="quiz-language">Try to recall its meaning before revealing it.</div>
          <p className="pronunciation-note">First play may use Gemini API quota. Generated audio is cached for offline replay.</p>
          {pronunciationError && <p className="pronunciation-error" role="alert">{pronunciationError}</p>}

          {revealed && <div className="quiz-answer">
            {definitions.map(definition => <article className="quiz-sense" key={definition.id}>
              <span className="quiz-pos">{definition.partOfSpeech}</span>
              <p>{definition.definition}</p>
              <div className="vocab-synonyms">
                <span className="vocab-synonyms-title">Synonyms</span>
                {definition.synonyms.length > 0 ? (
                  <div className="vocab-synonym-list">
                    {definition.synonyms.map(synonym => <span className="vocab-synonym-chip" key={`${definition.id}-${synonym}`}>{synonym}</span>)}
                  </div>
                ) : <span className="vocab-synonyms-empty">None saved yet</span>}
              </div>
              {(definition.examples?.length ? definition.examples : definition.example ? [{ example: definition.example, voice: 'other' as const }] : []).map((item, index) => (
                <p className="quiz-example" key={`${definition.id}-example-${index}`}>
                  <span className="example-voice">{item.voice}</span> “{item.example}”
                </p>
              ))}
              {(definition.examples?.length ?? 1) < 6 && <p className="examples-refresh-note">Use Refresh definition to generate six examples.</p>}
            </article>)}
          </div>}

          {error && <p className="quiz-error" role="alert"><AlertCircle size={16} />{error}</p>}
          {refreshMessage && <p className="quiz-success" role="status">{refreshMessage}</p>}
          <div className="quiz-actions">
            {!revealed && <button className="btn btn-primary" onClick={() => void reveal()}><Eye size={16} />Reveal definition</button>}
            {revealed && <button className="btn btn-secondary" onClick={() => { setRevealed(false); setDefinitions([]); setRefreshMessage(null); }} disabled={isRefreshing}><EyeOff size={16} />Hide definition</button>}
            {revealed && <button className="btn btn-secondary" onClick={() => void refreshDefinition()} disabled={isRefreshing}>
              <RotateCw size={16} className={isRefreshing ? 'spinner' : ''} />{isRefreshing ? 'Refreshing…' : 'Refresh definition'}
            </button>}
            <button className="btn btn-secondary" onClick={() => void loadNext(word.id)} disabled={isRefreshing}><ArrowRight size={16} />Next word</button>
          </div>
        </section>
      ) : (
        <section className="card quiz-card quiz-empty">
          <BookOpen size={34} />
          <h2>No defined words yet</h2>
          <p>Add words and save their definitions in Vocabulary mode. Word Quiz uses that same library.</p>
          {error && <p className="quiz-error" role="alert">{error}</p>}
        </section>
      )}

      <WordLibrary
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onSelectWord={wordId => { void selectLibraryWord(wordId); }}
        onWordListChanged={() => { if (!word) void loadNext(); }}
        definedWordsOnly
      />
    </div>
  );
};

export default WordQuizPage;
