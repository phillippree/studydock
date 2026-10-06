import React, { useCallback, useEffect, useState } from 'react';
import { Brain, Eye, EyeOff, ArrowRight, AlertCircle, BookOpen, RotateCw } from 'lucide-react';
import { VocabDefinition, VocabWord } from '../../../shared/contracts/vocab';
import { WordLibrary } from '../vocab/WordLibrary';

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

  const loadNext = useCallback(async (excludeWordId?: string) => {
    setLoading(true);
    setError(null);
    setRefreshMessage(null);
    setRevealed(false);
    setDefinitions([]);
    try {
      const nextWord = await window.studydockBridge.wordQuizGetRandomWord(excludeWordId);
      setWord(nextWord);
    } catch {
      setError('Could not load a quiz word. Please try again.');
      setWord(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadNext(); }, [loadNext]);

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
          <div className="quiz-word">{word.displayWord}</div>
          <div className="quiz-language">Try to recall its meaning before revealing it.</div>

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
