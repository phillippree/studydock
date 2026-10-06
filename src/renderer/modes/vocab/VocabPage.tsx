import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  RotateCw,
  ArrowRight,
  BookOpen,
  Database,
  AlertCircle,
  HelpCircle,
  Plus,
  Upload,
  Save,
  Home
} from 'lucide-react';
import { VocabWordWithDefinitions } from '../../../shared/contracts/vocab';
import { WordLibrary } from './WordLibrary';

interface VocabPageProps {
  onNavigateHome: () => void;
}

export const VocabPage: React.FC<VocabPageProps> = ({ onNavigateHome }) => {
  const [currentWordState, setCurrentWordState] = useState<VocabWordWithDefinitions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isSavingRetry, setIsSavingRetry] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active word tracking to prevent late responses from overwriting a different word
  const activeWordIdRef = useRef<string | null>(null);

  const loadRandomWord = useCallback(async (excludeCurrent = true) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const excludeId = excludeCurrent && currentWordState ? currentWordState.word.id : undefined;
      const result = await window.studydockBridge.vocabGetRandomWord({ excludeWordId: excludeId });

      if (result) {
        activeWordIdRef.current = result.word.id;
        setCurrentWordState(result);
      } else {
        activeWordIdRef.current = null;
        setCurrentWordState(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load word';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [currentWordState]);

  // Load first word on mount
  useEffect(() => {
    loadRandomWord(false);
  }, []);

  // Keyboard navigation shortcuts: Space or ArrowRight for next word
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or modal is open
      if (isLibraryOpen) return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault();
        loadRandomWord(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loadRandomWord, isLibraryOpen]);

  const handleRefreshDefinition = async () => {
    if (!currentWordState) return;
    const wordId = currentWordState.word.id;
    setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const result = await window.studydockBridge.vocabFetchDefinition(wordId, true);
      // Guard against race conditions: only update UI if user hasn't switched to a different word
      if (activeWordIdRef.current === wordId) {
        setCurrentWordState(result);
        if (result.generationError && result.status !== 'generated_gemini' && result.status !== 'saved_locally') {
          setErrorMessage(result.generationError);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Refresh failed';
      setErrorMessage(msg);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRetrySave = async () => {
    if (!currentWordState || currentWordState.definitions.length === 0) return;
    setIsSavingRetry(true);
    try {
      const result = await window.studydockBridge.vocabSaveDefinitionRetry(
        currentWordState.word.id,
        currentWordState.definitions.map(d => ({
          partOfSpeech: d.partOfSpeech,
          definition: d.definition,
          example: d.example,
          examples: d.examples,
          source: d.source
        }))
      );
      if (activeWordIdRef.current === currentWordState.word.id) {
        setCurrentWordState(result);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Retry save failed');
    } finally {
      setIsSavingRetry(false);
    }
  };

  const handleSelectWordFromLibrary = async (wordId: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    activeWordIdRef.current = wordId;
    try {
      const result = await window.studydockBridge.vocabFetchDefinition(wordId, false);
      if (activeWordIdRef.current === wordId) {
        setCurrentWordState(result);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch word details';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 24px', minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      {/* Top Controls Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={onNavigateHome} title="Return to Landing Page">
            <Home size={16} />
            Home
          </button>
          <span style={{ color: 'var(--text-dim)' }}>/</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Vocabulary Mode</span>
        </div>

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setIsLibraryOpen(true)}
        >
          <BookOpen size={16} />
          Word Library
        </button>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {/* Loading Spinner */}
        {isLoading && !currentWordState && (
          <div style={{ textAlign: 'center', padding: '64px' }}>
            <div className="spinner" style={{ width: '36px', height: '36px', margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-muted)' }}>Loading word...</p>
          </div>
        )}

        {/* Empty Library State */}
        {!isLoading && !currentWordState && (
          <div className="card" style={{ textAlign: 'center', padding: '60px 24px', maxWidth: '520px', margin: '0 auto' }}>
            <BookOpen size={48} color="var(--accent-primary)" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>Your Word Library is Empty</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '24px' }}>
              Add individual words or import a list to start learning and querying definitions.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => setIsLibraryOpen(true)}>
                <Plus size={16} />
                Add Words
              </button>
              <button className="btn btn-secondary" onClick={() => setIsLibraryOpen(true)}>
                <Upload size={16} />
                Import List
              </button>
            </div>
          </div>
        )}

        {/* Word Display Card */}
        {currentWordState && (
          <div
            className="card"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              boxShadow: 'var(--shadow-card)',
              position: 'relative'
            }}
          >
            {/* Header: Label & Status Badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Random Word
              </div>

              {/* Status Badges */}
              <div>
                {currentWordState.status === 'saved_locally' && (
                  <span className="badge badge-saved" title="This definition is saved in your local database">
                    <Database size={12} />
                    Saved locally
                  </span>
                )}
                {currentWordState.status === 'generated_gemini' && (
                  <span className="badge badge-gemini" title="Generated by Gemini AI and saved to library">
                    <Sparkles size={12} />
                    Generated by Gemini
                  </span>
                )}
                {currentWordState.status === 'not_saved' && (
                  <span className="badge badge-warning" title="Definition is in memory but not saved to disk">
                    <AlertCircle size={12} />
                    Not saved
                  </span>
                )}
                {currentWordState.status === 'unrecognized' && (
                  <span className="badge badge-warning" title="Term not recognized by lexicon">
                    <HelpCircle size={12} />
                    Unrecognized word
                  </span>
                )}
                {currentWordState.status === 'error' && (
                  <span className="badge badge-error" title="An error occurred during generation">
                    <AlertCircle size={12} />
                    Definition error
                  </span>
                )}
              </div>
            </div>

            {/* Prominent Word Name */}
            <div style={{ marginBottom: '28px' }}>
              <h1 style={{
                fontSize: '2.8rem',
                fontFamily: 'Georgia, serif',
                fontWeight: 800,
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                color: 'var(--text-primary)',
                wordBreak: 'break-word'
              }}>
                {currentWordState.word.displayWord}
              </h1>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                Language: {currentWordState.word.language.toUpperCase()}
              </div>
            </div>

            {/* Senses / Definitions */}
            {currentWordState.definitions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px' }}>
                {currentWordState.definitions.map((sense, index) => (
                  <div
                    key={sense.id || index}
                    style={{
                      padding: '16px 20px',
                      background: 'var(--bg-tertiary)',
                      borderLeft: '3px solid var(--accent-primary)',
                      borderRadius: '0 var(--radius-md) var(--radius-md) 0'
                    }}
                  >
                    <div style={{
                      fontStyle: 'italic',
                      fontWeight: 600,
                      color: 'var(--accent-secondary)',
                      fontSize: '0.9rem',
                      marginBottom: '6px',
                      textTransform: 'lowercase'
                    }}>
                      {sense.partOfSpeech}
                    </div>

                    <div style={{ fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '10px', lineHeight: 1.5 }}>
                      {sense.definition}
                    </div>

                    {(sense.examples?.length ? sense.examples : sense.example ? [{ example: sense.example, voice: 'other' as const }] : []).map((item, exampleIndex) => (
                      <div key={`${sense.id}-example-${exampleIndex}`} style={{ display: 'flex', gap: '12px', marginTop: '10px', alignItems: 'flex-start' }}>
                        <span className="example-voice">{item.voice}</span>
                        <p className="vocab-example">{item.example}</p>
                      </div>
                    ))}
                    {(sense.examples?.length ?? 1) < 6 && <p className="examples-refresh-note">{sense.examples?.length ?? 1} saved example{(sense.examples?.length ?? 1) === 1 ? '' : 's'}. Refresh the definition to generate six.</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                padding: '24px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '28px',
                textAlign: 'center'
              }}>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  {currentWordState.generationError || 'No definitions found for this word.'}
                </p>
                {currentWordState.status === 'not_saved' && !currentWordState.generationError && (
                  <button className="btn btn-secondary btn-sm" onClick={handleRefreshDefinition}>
                    <Sparkles size={14} />
                    Fetch Definition from Gemini
                  </button>
                )}
              </div>
            )}

            {/* Not Saved Retry Action Banner */}
            {currentWordState.status === 'not_saved' && currentWordState.definitions.length > 0 && (
              <div style={{
                padding: '12px 16px',
                background: 'var(--warning-bg)',
                border: '1px solid var(--warning-border)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px',
                fontSize: '0.875rem',
                color: 'var(--warning-text)'
              }}>
                <span>Definitions generated but not saved to the database.</span>
                <button className="btn btn-secondary btn-sm" onClick={handleRetrySave} disabled={isSavingRetry}>
                  <Save size={14} />
                  {isSavingRetry ? 'Saving...' : 'Save to Library'}
                </button>
              </div>
            )}

            {/* Error Banner */}
            {errorMessage && (
              <div style={{
                padding: '12px 16px',
                background: 'var(--error-bg)',
                border: '1px solid var(--error-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--error-text)',
                fontSize: '0.875rem',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={16} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Actions Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '20px',
              borderTop: '1px solid var(--border-subtle)',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <button
                className="btn btn-secondary"
                onClick={handleRefreshDefinition}
                disabled={isRefreshing || isLoading}
                title="Fetch updated definition from Gemini API"
              >
                <RotateCw size={16} className={isRefreshing ? 'spinner' : ''} />
                <span>{isRefreshing ? 'Refreshing...' : 'Refresh definition'}</span>
              </button>

              <button
                className="btn btn-primary btn-lg"
                onClick={() => loadRandomWord(true)}
                disabled={isLoading}
                style={{ padding: '10px 24px' }}
              >
                <span>Next random word</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Keyboard Shortcut Hint */}
      <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        Tip: Press <kbd style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-default)' }}>Space</kbd> or <kbd style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-default)' }}>→</kbd> for the next random word.
      </div>

      {/* Word Library Modal */}
      <WordLibrary
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onSelectWord={handleSelectWordFromLibrary}
        onWordListChanged={() => {
          if (!currentWordState) {
            loadRandomWord(false);
          }
        }}
      />
    </div>
  );
};

export default VocabPage;
