import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, CheckCircle, Plus, Quote, Search } from 'lucide-react';
import { ExpressionType, IdiomPhraseEntry } from '../../../shared/contracts/idiomsPhrases';

interface IdiomsPhrasesPageProps {
  onNavigateHome: () => void;
}

export const IdiomsPhrasesPage: React.FC<IdiomsPhrasesPageProps> = () => {
  const [entries, setEntries] = useState<IdiomPhraseEntry[]>([]);
  const [expression, setExpression] = useState('');
  const [type, setType] = useState<ExpressionType>('idiom');
  const [filter, setFilter] = useState<'all' | ExpressionType>('all');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const loadEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      setEntries(await window.studydockBridge.idiomsPhrasesList());
    } catch (err: unknown) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : 'Could not load your saved expressions.' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadEntries(); }, [loadEntries]);

  const filteredEntries = useMemo(() => entries.filter(entry =>
    (filter === 'all' || entry.type === filter) &&
    `${entry.expression} ${entry.meaning}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  ), [entries, filter, search]);

  const handleLookup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!expression.trim() || isLookingUp) return;
    setIsLookingUp(true);
    setFeedback(null);
    try {
      const result = await window.studydockBridge.idiomsPhrasesLookupAndSave({ expression, type });
      if (result.status === 'unrecognized') {
        setFeedback({ kind: 'error', message: `Gemini couldn't confirm “${result.expression}” as a ${type}.${result.suggestion ? ` Did you mean “${result.suggestion}”?` : ''} It wasn't saved.` });
      } else if (result.status === 'duplicate') {
        setFeedback({ kind: 'success', message: `“${result.entry.expression}” is already in your saved ${type === 'idiom' ? 'idioms' : 'phrases'}.` });
      } else {
        setEntries(current => [result.entry, ...current.filter(entry => entry.id !== result.entry.id)]);
        setExpression('');
        setFeedback({ kind: 'success', message: `“${result.entry.expression}” was verified and saved to your library.` });
      }
    } catch (err: unknown) {
      setFeedback({ kind: 'error', message: err instanceof Error ? err.message : 'The lookup failed. Please try again.' });
    } finally {
      setIsLookingUp(false);
    }
  };

  return (
    <div className="expressions-page">
      <div className="expressions-heading">
        <div className="expressions-title">
          <span className="expressions-icon"><Quote size={22} /></span>
          <div><h1>Idioms &amp; Phrases</h1><p>Look up expressions and save their meaning and examples.</p></div>
        </div>
        <span className="badge badge-saved">{entries.length} saved</span>
      </div>

      <section className="card expressions-lookup">
        <h2><Plus size={18} />Look up an expression</h2>
        <p className="expressions-help">Gemini checks the expression and saves it to your local library when it is recognized. Lookups require internet access and may use your Gemini quota.</p>
        <form onSubmit={handleLookup}>
          <div className="expressions-form-row">
            <div className="input-group expressions-type-field">
              <label className="input-label" htmlFor="expression-type">Type</label>
              <select id="expression-type" className="input-text" value={type} disabled={isLookingUp} onChange={event => setType(event.target.value as ExpressionType)}>
                <option value="idiom">Idiom</option>
                <option value="phrase">Phrase</option>
              </select>
            </div>
            <div className="input-group expressions-input-field">
              <label className="input-label" htmlFor="expression-input">Idiom or phrase</label>
              <input id="expression-input" className="input-text" value={expression} maxLength={120} disabled={isLookingUp} placeholder="e.g. break the ice" onChange={event => { setExpression(event.target.value); setFeedback(null); }} />
            </div>
            <button className="btn btn-primary expressions-submit" type="submit" disabled={!expression.trim() || isLookingUp}>
              {isLookingUp ? <div className="spinner" /> : <Search size={17} />}
              {isLookingUp ? 'Looking up…' : 'Look up & Save'}
            </button>
          </div>
        </form>
        {feedback && <div className={`expressions-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
          {feedback.kind === 'error' ? <AlertCircle size={17} /> : <CheckCircle size={17} />}{feedback.message}
        </div>}
      </section>

      <section className="expressions-library">
        <div className="expressions-library-heading"><div><h2><BookOpen size={19} />Your expression library</h2><p>Saved expressions are available offline.</p></div>
          <div className="expressions-filters" role="group" aria-label="Filter expressions">
            {(['all', 'idiom', 'phrase'] as const).map(value => <button key={value} className={`btn btn-sm ${filter === value ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(value)}>{value === 'all' ? 'All' : value === 'idiom' ? 'Idioms' : 'Phrases'}</button>)}
          </div>
        </div>
        <label className="expressions-search"><Search size={17} /><span className="sr-only">Search saved expressions</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search your expressions…" /></label>
        {isLoading ? <div className="card expressions-empty"><div className="spinner" /><p>Loading saved expressions…</p></div> : filteredEntries.length === 0 ? (
          <div className="card expressions-empty"><Quote size={28} /><h3>{entries.length === 0 ? 'Your library is ready' : 'No matching expressions'}</h3><p>{entries.length === 0 ? 'Look up an idiom or phrase above to start your collection.' : 'Try another search or switch the filter.'}</p></div>
        ) : <div className="expressions-grid">{filteredEntries.map(entry => <article className="card expression-card" key={entry.id}>
          <div className="expression-card-heading"><div><span className="expression-type-label">{entry.type}</span><h3>{entry.expression}</h3></div><span className="expression-language">{entry.language.toUpperCase()}</span></div>
          <p className="expression-meaning">{entry.meaning}</p>
          <div className="expression-examples">{entry.examples.map(example => <p key={example.id}>“{example.example}”</p>)}</div>
        </article>)}</div>}
      </section>
    </div>
  );
};

export default IdiomsPhrasesPage;
