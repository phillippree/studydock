import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle, Laugh, Plus, Search, X } from 'lucide-react';
import { JokeEntry, JokeExampleVoice, JokeLookupChoice, JokeLookupPreview, JokeLookupResult, JokeType } from '../../../shared/contracts/jokes';

const PAGE_SIZE = 6;

function JokeExamples({ examples }: { examples: Array<{ id?: string; example: string; voice: JokeExampleVoice }> }) {
  return <div className="expression-examples joke-example-list">{examples.map((item, index) => <p key={item.id || `${index}-${item.example}`}><span className={`expression-example-voice ${item.voice}`}>{item.voice}</span>“{item.example}”</p>)}</div>;
}

export const JokesPage: React.FC = () => {
  const [text, setText] = useState('');
  const [type, setType] = useState<JokeType>('joke');
  const [filter, setFilter] = useState<'all' | JokeType>('all');
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<JokeEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<JokeLookupPreview | null>(null);
  const [choiceSet, setChoiceSet] = useState<Extract<JokeLookupResult, { status: 'choices' }> | null>(null);
  const [selected, setSelected] = useState<JokeEntry | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const listRequest = useRef(0);

  const loadEntries = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true);
    try {
      const result = await window.studydockBridge.jokesList({
        type: filter === 'all' ? undefined : filter,
        search,
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE
      });
      if (request === listRequest.current) { setEntries(result.entries); setTotal(result.total); }
    } catch (error: unknown) {
      if (request === listRequest.current) setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load your joke library.' });
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, [filter, page, search]);

  useEffect(() => { void loadEntries(); }, [loadEntries]);
  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selected]);

  const lookup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim() || lookingUp) return;
    setLookingUp(true); setPreview(null); setChoiceSet(null); setFeedback(null);
    try {
      const result = await window.studydockBridge.jokesLookup({ text, type });
      if (result.status === 'unrecognized') {
        setFeedback({ kind: 'error', message: result.suggestion ? `Gemini couldn't verify this as a ${type}. Suggestion: ${result.suggestion}` : `Gemini couldn't verify this as a ${type}. Nothing was saved.` });
      } else if (result.status === 'duplicate') {
        setFeedback({ kind: 'success', message: `This ${type} is already in your library.` });
      } else if (result.status === 'choices') setChoiceSet(result);
      else setPreview(result);
    } catch (error: unknown) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'The lookup failed. Please try again.' });
    } finally { setLookingUp(false); }
  };

  const savePreview = async () => {
    if (!preview || saving) return;
    setSaving(true); setFeedback(null);
    try {
      const result = await window.studydockBridge.jokesSavePreview(preview.token);
      setPreview(null); setChoiceSet(null); setText(''); setPage(0);
      setFeedback({ kind: 'success', message: result.status === 'saved' ? 'Saved to your local joke library.' : 'This entry is already saved in your library.' });
      await loadEntries();
    } catch (error: unknown) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Could not save this entry.' });
    } finally { setSaving(false); }
  };

  const selectVariation = (choice: JokeLookupChoice) => {
    setPreview({ ...choice, status: 'preview' });
    setFeedback(null);
  };

  return <main className="jokes-page">
    <header className="connectors-heading">
      <span className="connectors-icon"><Laugh size={24} /></span>
      <div><h1>Punchlines &amp; Jokes</h1><p>Collect jokes and punchlines, with a little context for why they work.</p></div>
      <span className="badge badge-saved connectors-count">{total} saved</span>
    </header>

    <section className="card connectors-lookup">
      <h2><Plus size={18} />Look up a joke or punchline</h2>
      <p>Gemini checks the text and previews a brief explanation. Save it to your own local library when you choose. Lookups require internet access and may use your Gemini quota.</p>
      <form className="jokes-lookup-form" onSubmit={lookup}>
        <label className="input-group jokes-type-field"><span className="input-label">Type</span><select className="input-text" value={type} disabled={lookingUp || saving} onChange={event => { setType(event.target.value as JokeType); setPreview(null); setChoiceSet(null); setFeedback(null); }}><option value="joke">Joke</option><option value="punchline">Punchline</option></select></label>
        <label className="input-group"><span className="input-label">Joke or punchline</span><textarea className="input-text jokes-input" value={text} maxLength={2000} rows={3} disabled={lookingUp || saving} placeholder="Paste or write a joke or punchline…" onChange={event => { setText(event.target.value); setPreview(null); setChoiceSet(null); setFeedback(null); }} /></label>
        <button className="btn btn-primary" type="submit" disabled={!text.trim() || lookingUp || saving}>{lookingUp ? <span className="spinner" /> : <Search size={17} />}{lookingUp ? 'Looking up…' : 'Look up'}</button>
      </form>
      {feedback && <div className={`expressions-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.kind === 'error' ? <AlertCircle size={17} /> : <CheckCircle size={17} />}{feedback.message}</div>}
      {choiceSet && <section className="card joke-variation-choices" aria-live="polite"><h3>Punchline variations</h3><p>These are alternate versions of the joke itself, keeping the same humorous idea as “{choiceSet.text}”. Choose one to review its explanation and example sentences before saving.</p><div>{choiceSet.choices.map((choice, index) => <article className="joke-variation-option" key={choice.token}><span className="expression-type-label">Variation {index + 1}</span><p>{choice.text}</p><button className="btn btn-secondary btn-sm" type="button" onClick={() => selectVariation(choice)}>Review this version</button></article>)}</div><button className="btn btn-ghost btn-sm" type="button" onClick={() => setChoiceSet(null)}>Discard suggestions</button></section>}
      {preview && <article className="card connector-preview joke-preview" aria-live="polite">
        {preview.sourceText !== preview.text && <p className="joke-source-text">Based on your idea: “{preview.sourceText}”</p>}
        <div className="connector-entry-heading"><div><span className="expression-type-label">Preview · {preview.type}</span><h3>{preview.text}</h3></div><span className="expression-language">{preview.language.toUpperCase()}</span></div>
        <section className="expression-detail-meaning"><h3>Why it works</h3><p>{preview.explanation}</p></section>
        <section className="expression-detail-examples"><h3>Example sentences <span className="badge badge-saved">{preview.examples.length}</span></h3><JokeExamples examples={preview.examples} /></section>
        <div className="expression-preview-actions"><button className="btn btn-primary" onClick={() => void savePreview()} disabled={saving}>{saving ? <span className="spinner" /> : <Plus size={16} />}{saving ? 'Saving…' : 'Save to Library'}</button>{choiceSet && <button className="btn btn-secondary" onClick={() => { setPreview(null); }} disabled={saving}>Choose another version</button>}<button className="btn btn-secondary" onClick={() => { setPreview(null); setChoiceSet(null); }} disabled={saving}>Discard preview</button></div>
      </article>}
    </section>

    <section className="connectors-library">
      <div className="connectors-library-heading"><div><h2><Laugh size={19} />Your joke library</h2><p>Saved jokes and punchlines are available offline.</p></div><div className="expressions-filters" role="group" aria-label="Filter joke library">{(['all', 'joke', 'punchline'] as const).map(value => <button key={value} className={`btn btn-sm ${filter === value ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setPage(0); setFilter(value); }}>{value === 'all' ? 'All' : value === 'joke' ? 'Jokes' : 'Punchlines'}</button>)}</div></div>
      <label className="expressions-search"><Search size={17} /><span className="sr-only">Search saved jokes and punchlines</span><input value={search} onChange={event => { setPage(0); setSearch(event.target.value); }} placeholder="Search your jokes and punchlines…" /></label>
      {loading ? <div className="card expressions-empty"><span className="spinner" /><p>Loading saved jokes…</p></div> : entries.length === 0 ? <div className="card expressions-empty"><Laugh size={28} /><h3>{total === 0 ? 'Your library is ready' : 'No matching entries'}</h3><p>{total === 0 ? 'Look up a joke or punchline above to start your collection.' : 'Try another search or filter.'}</p></div> : <div className="connectors-grid">{entries.map(entry => <article className="card expression-card joke-library-card" key={entry.id}><div className="connector-entry-heading"><div><span className="expression-type-label">{entry.type}</span><h3><button className="expression-open-button" onClick={() => setSelected(entry)}>{entry.text}</button></h3></div><span className="expression-language">{entry.language.toUpperCase()}</span></div><p className="expression-meaning">{entry.explanation}</p><button className="joke-open-link" onClick={() => setSelected(entry)}>View full entry · {entry.examples.length} examples</button></article>)}</div>}
      {!loading && total > 0 && <div className="expressions-pagination"><span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span><div><button className="btn btn-secondary btn-sm" onClick={() => setPage(current => Math.max(current - 1, 0))} disabled={page === 0}><ArrowLeft size={15} />Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span><button className="btn btn-secondary btn-sm" onClick={() => setPage(current => current + 1)} disabled={(page + 1) * PAGE_SIZE >= total}>Next<ArrowRight size={15} /></button></div></div>}
    </section>

    {selected && <div className="modal-backdrop expression-detail-backdrop" onClick={() => setSelected(null)}><section className="modal-content expression-detail-modal" role="dialog" aria-modal="true" aria-labelledby="joke-detail-title" onClick={event => event.stopPropagation()}><div className="expression-detail-header"><div><span className="expression-type-label">{selected.type}</span><span className="expression-language">{selected.language.toUpperCase()}</span></div><button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)} aria-label="Close joke card" autoFocus><X size={20} /></button></div><h2 id="joke-detail-title" className="expression-detail-title">{selected.text}</h2><section className="expression-detail-meaning"><h3>Why it works</h3><p>{selected.explanation}</p></section><section className="expression-detail-examples"><h3>Example sentences <span className="badge badge-saved">{selected.examples.length}</span></h3>{selected.examples.length ? <JokeExamples examples={selected.examples} /> : <p>Example sentences are not available for this older saved entry.</p>}</section></section></div>}
  </main>;
};

export default JokesPage;
