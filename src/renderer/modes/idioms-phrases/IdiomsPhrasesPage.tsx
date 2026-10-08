import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, BookOpen, Brain, CheckCircle, Eye, Plus, Quote, RefreshCw, Search, X } from 'lucide-react';
import { ExpressionLookupPreview, ExpressionType, IdiomPhraseEntry } from '../../../shared/contracts/idiomsPhrases';

interface IdiomsPhrasesPageProps {
  onNavigateHome: () => void;
}

export const IdiomsPhrasesPage: React.FC<IdiomsPhrasesPageProps> = () => {
  const pageSize = 6;
  const [entries, setEntries] = useState<IdiomPhraseEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [expression, setExpression] = useState('');
  const [type, setType] = useState<ExpressionType>('phrase');
  const [filter, setFilter] = useState<'all' | ExpressionType>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSavingPreview, setIsSavingPreview] = useState(false);
  const [lookupPreview, setLookupPreview] = useState<ExpressionLookupPreview | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string; suggestion?: string } | null>(null);
  const requestSequence = useRef(0);
  const hasLibraryQuery = search.trim().length > 0 || filter !== 'all';
  const [view, setView] = useState<'home' | 'library' | 'quiz'>('home');
  const [quizFilter, setQuizFilter] = useState<'all' | ExpressionType>('all');
  const [quizPrompt, setQuizPrompt] = useState<Awaited<ReturnType<Window['studydockBridge']['idiomsPhrasesQuizGetRandom']>>>(null);
  const [quizAnswer, setQuizAnswer] = useState<IdiomPhraseEntry | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizRevealing, setQuizRevealing] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizRefreshMessage, setQuizRefreshMessage] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const quizRequestSequence = useRef(0);
  const [refreshingEntryId, setRefreshingEntryId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<IdiomPhraseEntry | null>(null);
  const [detailRefreshMessage, setDetailRefreshMessage] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!selectedEntry) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedEntry(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedEntry]);

  const loadQuizPrompt = async (selectedFilter = quizFilter, excludeId?: string) => {
    const requestId = ++quizRequestSequence.current;
    setQuizLoading(true);
    setQuizAnswer(null);
    setQuizError(null);
    setQuizRefreshMessage(null);
    try {
      const prompt = await window.studydockBridge.idiomsPhrasesQuizGetRandom(
        selectedFilter === 'all' ? undefined : selectedFilter,
        excludeId
      );
      if (requestId === quizRequestSequence.current) setQuizPrompt(prompt);
    } catch (err: unknown) {
      if (requestId === quizRequestSequence.current) {
        setQuizPrompt(null);
        setQuizError(err instanceof Error ? err.message : 'Could not load a quiz expression.');
      }
    } finally {
      if (requestId === quizRequestSequence.current) setQuizLoading(false);
    }
  };

  const startQuiz = () => {
    setView('quiz');
    void loadQuizPrompt();
  };

  const openLibrary = () => {
    setFeedback(null);
    setView('library');
  };

  const refreshExamples = async (id: string) => {
    if (refreshingEntryId) return;
    setRefreshingEntryId(id);
    setDetailRefreshMessage(null);
    setFeedback(null);
    try {
      const updated = await window.studydockBridge.idiomsPhrasesRefreshExamples(id);
      setEntries(current => current.map(entry => entry.id === id ? updated : entry));
      setSelectedEntry(current => current?.id === id ? updated : current);
      const message = `Refreshed six example sentences for “${updated.expression}”.`;
      if (quizAnswer?.id === id && quizPrompt?.id === id) {
        setQuizAnswer(updated);
        setQuizRefreshMessage({ kind: 'success', message });
      } else if (selectedEntry?.id === id) setDetailRefreshMessage({ kind: 'success', message });
      else setFeedback({ kind: 'success', message });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not refresh these example sentences.';
      if (quizAnswer?.id === id && quizPrompt?.id === id) setQuizRefreshMessage({ kind: 'error', message });
      else if (selectedEntry?.id === id) setDetailRefreshMessage({ kind: 'error', message });
      else setFeedback({ kind: 'error', message });
    } finally {
      setRefreshingEntryId(null);
    }
  };

  const revealQuizAnswer = async () => {
    if (!quizPrompt || quizAnswer || quizRevealing) return;
    const currentId = quizPrompt.id;
    const requestId = quizRequestSequence.current;
    setQuizRevealing(true);
    setQuizError(null);
    try {
      const answer = await window.studydockBridge.idiomsPhrasesQuizReveal(currentId);
      if (requestId === quizRequestSequence.current && quizPrompt?.id === currentId) {
        setQuizAnswer(answer);
        setQuizRefreshMessage(null);
      }
    } catch (err: unknown) {
      if (requestId === quizRequestSequence.current) setQuizError(err instanceof Error ? err.message : 'Could not reveal this expression.');
    } finally {
      if (requestId === quizRequestSequence.current) setQuizRevealing(false);
    }
  };

  const loadEntries = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setIsLoading(true);
    try {
      const result = await window.studydockBridge.idiomsPhrasesList({
        type: filter === 'all' ? undefined : filter,
        search,
        offset: page * pageSize,
        limit: pageSize
      });
      if (requestId === requestSequence.current) {
        setEntries(result.entries);
        setTotal(result.total);
      }
    } catch (err: unknown) {
      if (requestId === requestSequence.current) {
        setFeedback({ kind: 'error', message: err instanceof Error ? err.message : 'Could not load your saved expressions.' });
      }
    } finally {
      if (requestId === requestSequence.current) setIsLoading(false);
    }
  }, [filter, page, pageSize, search]);

  useEffect(() => { void loadEntries(); }, [loadEntries, reloadVersion]);

  const handleLookup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!expression.trim() || isLookingUp) return;
    setIsLookingUp(true);
    setLookupPreview(null);
    setFeedback(null);
    try {
      const result = await window.studydockBridge.idiomsPhrasesLookup({ expression, type });
      if (result.status === 'unrecognized') {
        setFeedback({
          kind: result.suggestion ? 'success' : 'error',
          message: result.suggestion ? `This expression may need a correction. Suggested ${type}:` : `Gemini couldn't confirm “${result.expression}” as a ${type}. It wasn't saved.`,
          suggestion: result.suggestion
        });
      } else if (result.status === 'duplicate') {
        setFeedback({ kind: 'success', message: `“${result.entry.expression}” is already in your saved ${type === 'idiom' ? 'idioms' : 'phrases'}.` });
      } else {
        setLookupPreview(result);
      }
    } catch (err: unknown) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : 'The lookup failed. Please try again.' });
    } finally {
      setIsLookingUp(false);
    }
  };

  const saveLookupPreview = async () => {
    if (!lookupPreview || isSavingPreview) return;
    setIsSavingPreview(true);
    setFeedback(null);
    try {
      const result = await window.studydockBridge.idiomsPhrasesSavePreview(lookupPreview.token);
      setLookupPreview(null);
      setPage(0);
      setReloadVersion(version => version + 1);
      setExpression('');
      setFeedback({ kind: 'success', message: result.status === 'duplicate' ? `“${result.entry.expression}” was already saved in your library.` : `“${result.entry.expression}” was saved to your library.` });
    } catch (err: unknown) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : 'Could not save this expression.' });
    } finally {
      setIsSavingPreview(false);
    }
  };

  return (
    <div className="expressions-page">
      <div className="expressions-heading">
        <div className="expressions-title">
          <span className="expressions-icon">{view === 'quiz' ? <Brain size={22} /> : view === 'library' ? <BookOpen size={22} /> : <Quote size={22} />}</span>
          <div><h1>{view === 'quiz' ? 'Guess the meaning' : view === 'library' ? 'Expression Library' : 'Idioms & Phrases'}</h1><p>{view === 'quiz' ? 'Think of the meaning, then reveal the answer.' : view === 'library' ? 'Browse all your saved idioms and phrases.' : 'Look up expressions and save their meaning and examples.'}</p></div>
        </div>
        {view === 'home' ? <div className="expressions-heading-actions"><span className="badge badge-saved">{total} {hasLibraryQuery ? 'matches' : 'saved'}</span><button className="btn btn-secondary" onClick={openLibrary}><BookOpen size={16} />Expression Library</button><button className="btn btn-secondary" onClick={startQuiz}><Brain size={16} />Practice</button></div> : view === 'quiz' ? <button className="btn btn-secondary" onClick={openLibrary}><BookOpen size={16} />Expression Library</button> : <button className="btn btn-secondary" onClick={() => setView('home')}><ArrowLeft size={16} />Back to Idioms & Phrases</button>}
      </div>

      {view === 'quiz' ? <section className="card expression-quiz-card">
        <div className="expressions-filters" role="group" aria-label="Quiz expression type">
          {(['all', 'idiom', 'phrase'] as const).map(value => <button key={value} className={`btn btn-sm ${quizFilter === value ? 'btn-primary' : 'btn-secondary'}`} disabled={quizLoading || quizRevealing} onClick={() => { setQuizFilter(value); void loadQuizPrompt(value); }}>{value === 'all' ? 'All' : value === 'idiom' ? 'Idioms' : 'Phrases'}</button>)}
        </div>
        {quizLoading ? <div className="expressions-quiz-state"><div className="spinner" /><p>Finding an expression…</p></div> : quizPrompt ? <>
          <div className="expression-quiz-type">{quizPrompt.type}</div>
          <p className="expression-quiz-question">What does this expression mean?</p>
          <h2 className="expression-quiz-prompt">{quizPrompt.expression}</h2>
          <p className="expression-language">{quizPrompt.language.toUpperCase()}</p>
          {quizAnswer && <div className="expression-quiz-answer" aria-live="polite">
            <h3>Meaning</h3><p>{quizAnswer.meaning}</p>
            <div className="expression-quiz-examples">
              <div className="expression-quiz-examples-heading"><h3>Examples <span className="badge badge-saved">{quizAnswer.examples.length}</span></h3><button className="btn btn-secondary btn-sm expression-refresh-button" onClick={() => void refreshExamples(quizAnswer.id)} disabled={refreshingEntryId !== null} aria-label={`Refresh six example sentences for ${quizAnswer.expression}`} title="Generate and save six new example sentences">{refreshingEntryId === quizAnswer.id ? <span className="spinner" /> : <RefreshCw size={15} />}{refreshingEntryId === quizAnswer.id ? 'Refreshing…' : 'Refresh sentences'}</button></div>
              {quizAnswer.examples.length > 0 ? <div className="expression-examples">{quizAnswer.examples.map(example => <p key={example.id}><span className={`expression-example-voice ${example.voice}`}>{example.voice}</span>“{example.example}”</p>)}</div> : <p className="expression-detail-empty">No example sentences have been saved yet.</p>}
              {quizRefreshMessage && <div className={`expressions-feedback ${quizRefreshMessage.kind}`} role={quizRefreshMessage.kind === 'error' ? 'alert' : 'status'}>{quizRefreshMessage.kind === 'error' ? <AlertCircle size={17} /> : <CheckCircle size={17} />}{quizRefreshMessage.message}</div>}
            </div>
          </div>}
          {quizError && <p className="quiz-error" role="alert"><AlertCircle size={16} />{quizError}</p>}
          <div className="expression-quiz-actions">
            {!quizAnswer && <button className="btn btn-primary" onClick={() => void revealQuizAnswer()} disabled={quizRevealing}><Eye size={16} />{quizRevealing ? 'Revealing…' : 'Reveal meaning'}</button>}
            <button className="btn btn-secondary" onClick={() => void loadQuizPrompt(quizFilter, quizPrompt.id)} disabled={quizLoading || quizRevealing}><ArrowRight size={16} />Next expression</button>
          </div>
        </> : <div className="expressions-quiz-state"><Quote size={28} /><h2>No saved expressions in this category</h2><p>Save an idiom or phrase in your library to practice it here.</p>{quizError && <p className="quiz-error" role="alert">{quizError}</p>}<button className="btn btn-secondary" onClick={() => setView('home')}><BookOpen size={16} />Back to Idioms & Phrases</button></div>}
      </section> : view === 'library' ? <section className="card expression-table-card">
          <div className="expression-table-heading">
          <div><h2><BookOpen size={19} />All expressions <span className="badge badge-saved">{total}</span></h2><p>Saved expressions and their meanings, stored locally for offline use.</p></div>
          <div className="expressions-filters" role="group" aria-label="Filter expression library">
            {(['all', 'idiom', 'phrase'] as const).map(value => <button key={value} className={`btn btn-sm ${filter === value ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setPage(0); setFilter(value); }}>{value === 'all' ? 'All' : value === 'idiom' ? 'Idioms' : 'Phrases'}</button>)}
          </div>
        </div>
        <label className="expressions-search"><Search size={17} /><span className="sr-only">Search saved expressions</span><input value={search} onChange={event => { setPage(0); setSearch(event.target.value); }} placeholder="Search your expressions…" /></label>
        {feedback && <div className={`expressions-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.kind === 'error' ? <AlertCircle size={17} /> : <CheckCircle size={17} />}{feedback.message}</div>}
        {isLoading ? <div className="card expressions-empty"><div className="spinner" /><p>Loading saved expressions…</p></div> : entries.length === 0 ? <div className="card expressions-empty"><Quote size={28} /><h3>{total === 0 ? 'Your library is ready' : 'No matching expressions'}</h3><p>{total === 0 ? 'Look up an idiom or phrase to add it to your library.' : 'Try another search or switch the filter.'}</p></div> : <div className="expression-table-scroll"><table className="expression-table"><thead><tr><th scope="col">Expression</th><th scope="col">Type</th><th scope="col">Meaning</th><th scope="col">Language</th><th scope="col">Examples</th><th scope="col">Actions</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id}><th scope="row"><button className="expression-open-button" onClick={() => { setDetailRefreshMessage(null); setSelectedEntry(entry); }} aria-label={`Show full card for ${entry.expression}`}>{entry.expression}</button></th><td><span className="expression-type-label">{entry.type}</span></td><td>{entry.meaning}</td><td>{entry.language.toUpperCase()}</td><td>{entry.examples.length} saved</td><td><button className="btn btn-secondary btn-sm expression-refresh-button" onClick={() => void refreshExamples(entry.id)} disabled={refreshingEntryId !== null} aria-label={`Refresh six example sentences for ${entry.expression}`} title="Generate and save six new example sentences">{refreshingEntryId === entry.id ? <span className="spinner" /> : <RefreshCw size={15} />}{refreshingEntryId === entry.id ? 'Refreshing…' : 'Refresh sentences'}</button></td></tr>)}</tbody></table></div>}
        {!isLoading && total > 0 && <div className="expressions-pagination" aria-label="Expression library pagination">
          <span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}</span>
          <div><button className="btn btn-secondary btn-sm" onClick={() => setPage(current => Math.max(0, current - 1))} disabled={page === 0 || isLoading} aria-label="Previous page"><ArrowLeft size={15} />Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(total / pageSize))}</span><button className="btn btn-secondary btn-sm" onClick={() => setPage(current => current + 1)} disabled={(page + 1) * pageSize >= total || isLoading} aria-label="Next page">Next<ArrowRight size={15} /></button></div>
        </div>}
      </section> : <>

      <section className="card expressions-lookup">
        <h2><Plus size={18} />Look up an expression</h2>
        <p className="expressions-help">Look up an expression to preview its meaning and examples. Save it to your local library only when you choose. Lookups require internet access and may use your Gemini quota.</p>
        <form onSubmit={handleLookup}>
          <div className="expressions-form-row">
            <div className="input-group expressions-type-field">
              <label className="input-label" htmlFor="expression-type">Type</label>
              <select id="expression-type" className="input-text" value={type} disabled={isLookingUp || isSavingPreview} onChange={event => { setType(event.target.value as ExpressionType); setLookupPreview(null); }}>
                <option value="idiom">Idiom</option>
                <option value="phrase">Phrase</option>
              </select>
            </div>
            <div className="input-group expressions-input-field">
              <label className="input-label" htmlFor="expression-input">Idiom or phrase</label>
              <input id="expression-input" className="input-text" value={expression} maxLength={120} disabled={isLookingUp || isSavingPreview} placeholder="e.g. break the ice" onChange={event => { setExpression(event.target.value); setLookupPreview(null); setFeedback(null); }} />
            </div>
            <button className="btn btn-primary expressions-submit" type="submit" disabled={!expression.trim() || isLookingUp || isSavingPreview}>
              {isLookingUp ? <div className="spinner" /> : <Search size={17} />}
              {isLookingUp ? 'Looking up…' : 'Look up'}
            </button>
          </div>
        </form>
        {lookupPreview && <article className="card expression-lookup-preview" aria-live="polite">
          <div className="expression-card-heading"><div><span className="expression-type-label">Preview · {lookupPreview.type}</span><h3>{lookupPreview.expression}</h3></div><span className="expression-language">{lookupPreview.language.toUpperCase()}</span></div>
          <p className="expression-meaning">{lookupPreview.meaning}</p>
          <div className="expression-examples">{lookupPreview.examples.map((example, index) => <p key={`${index}-${example.example}`}><span className={`expression-example-voice ${example.voice}`}>{example.voice}</span>“{example.example}”</p>)}</div>
          <div className="expression-preview-actions"><button className="btn btn-primary" onClick={() => void saveLookupPreview()} disabled={isSavingPreview}>{isSavingPreview ? <span className="spinner" /> : <Plus size={16} />}{isSavingPreview ? 'Saving…' : 'Save to Library'}</button><button className="btn btn-secondary" onClick={() => setLookupPreview(null)} disabled={isSavingPreview}>Discard preview</button></div>
        </article>}
        {feedback && <div className={`expressions-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
          {feedback.kind === 'error' ? <AlertCircle size={17} /> : <CheckCircle size={17} />}
          <span>{feedback.message}{feedback.suggestion && <><strong className="expression-correction">{feedback.suggestion}</strong><button type="button" className="btn btn-secondary btn-sm" onClick={() => { setExpression(feedback.suggestion!); setFeedback(null); }}>Use suggestion</button></>}</span>
        </div>}
      </section>

      <section className="expressions-library">
        <div className="expressions-library-heading"><div><h2><BookOpen size={19} />Your expression library</h2><p>Saved expressions are available offline.</p></div>
          <div className="expressions-filters" role="group" aria-label="Filter expressions">
            {(['all', 'idiom', 'phrase'] as const).map(value => <button key={value} className={`btn btn-sm ${filter === value ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setPage(0); setFilter(value); }}>{value === 'all' ? 'All' : value === 'idiom' ? 'Idioms' : 'Phrases'}</button>)}
          </div>
        </div>
        <label className="expressions-search"><Search size={17} /><span className="sr-only">Search saved expressions</span><input value={search} onChange={event => { setPage(0); setSearch(event.target.value); }} placeholder="Search your expressions…" /></label>
        {isLoading ? <div className="card expressions-empty"><div className="spinner" /><p>Loading saved expressions…</p></div> : entries.length === 0 ? (
          <div className="card expressions-empty"><Quote size={28} /><h3>{total === 0 && !hasLibraryQuery ? 'Your library is ready' : 'No matching expressions'}</h3><p>{total === 0 && !hasLibraryQuery ? 'Look up an idiom or phrase above to start your collection.' : 'Try another search or switch the filter.'}</p></div>
        ) : <div className="expressions-grid">{entries.map(entry => <article className="card expression-card" key={entry.id}>
          <div className="expression-card-heading"><div><span className="expression-type-label">{entry.type}</span><h3><button className="expression-open-button" onClick={() => { setDetailRefreshMessage(null); setSelectedEntry(entry); }} aria-label={`Show full card for ${entry.expression}`}>{entry.expression}</button></h3></div><span className="expression-language">{entry.language.toUpperCase()}</span></div>
          <p className="expression-meaning">{entry.meaning}</p>
          <div className="expression-examples">{entry.examples.map(example => <p key={example.id}><span className={`expression-example-voice ${example.voice}`}>{example.voice}</span>“{example.example}”</p>)}</div>
        </article>)}</div>}
        {!isLoading && total > 0 && <div className="expressions-pagination" aria-label="Expression library pagination">
          <span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}</span>
          <div>
            <button className="btn btn-secondary btn-sm" onClick={() => setPage(current => Math.max(0, current - 1))} disabled={page === 0 || isLoading} aria-label="Previous page"><ArrowLeft size={15} />Previous</button>
            <span>Page {page + 1} of {Math.max(1, Math.ceil(total / pageSize))}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setPage(current => current + 1)} disabled={(page + 1) * pageSize >= total || isLoading} aria-label="Next page">Next<ArrowRight size={15} /></button>
          </div>
        </div>}
      </section>
      </>}
      {selectedEntry && <div className="modal-backdrop expression-detail-backdrop" onClick={() => setSelectedEntry(null)}>
        <section className="modal-content expression-detail-modal" role="dialog" aria-modal="true" aria-labelledby="expression-detail-title" onClick={event => event.stopPropagation()}>
          <div className="expression-detail-header">
            <div><span className="expression-type-label">{selectedEntry.type}</span><span className="expression-language">{selectedEntry.language.toUpperCase()}</span></div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedEntry(null)} aria-label="Close expression card" autoFocus><X size={20} /></button>
          </div>
          <h2 id="expression-detail-title" className="expression-detail-title">{selectedEntry.expression}</h2>
          <section className="expression-detail-meaning"><h3>Meaning</h3><p>{selectedEntry.meaning}</p></section>
          <section className="expression-detail-examples"><div className="expression-detail-examples-heading"><h3>Examples <span className="badge badge-saved">{selectedEntry.examples.length}</span></h3><button className="btn btn-secondary btn-sm expression-refresh-button" onClick={() => void refreshExamples(selectedEntry.id)} disabled={refreshingEntryId !== null} aria-label={`Refresh six example sentences for ${selectedEntry.expression}`} title="Generate and save six new example sentences">{refreshingEntryId === selectedEntry.id ? <span className="spinner" /> : <RefreshCw size={15} />}{refreshingEntryId === selectedEntry.id ? 'Refreshing…' : 'Refresh sentences'}</button></div>
            {selectedEntry.examples.length > 0 ? <div className="expression-examples">{selectedEntry.examples.map(example => <p key={example.id}><span className={`expression-example-voice ${example.voice}`}>{example.voice}</span>“{example.example}”</p>)}</div> : <p className="expression-detail-empty">No example sentences have been saved yet.</p>}
            {detailRefreshMessage && <div className={`expressions-feedback ${detailRefreshMessage.kind}`} role={detailRefreshMessage.kind === 'error' ? 'alert' : 'status'}>{detailRefreshMessage.kind === 'error' ? <AlertCircle size={17} /> : <CheckCircle size={17} />}{detailRefreshMessage.message}</div>}
          </section>
        </section>
      </div>}
    </div>
  );
};

export default IdiomsPhrasesPage;
