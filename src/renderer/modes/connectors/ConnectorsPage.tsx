import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle, Plus, RefreshCw, Search, Workflow, X } from 'lucide-react';
import { CONNECTOR_CATEGORIES, ConnectorEntry, ConnectorLookupPreview, ConnectorCategory } from '../../../shared/contracts/connectors';

const categoryNames: Record<ConnectorCategory, string> = {
  addition: 'Addition', contrast: 'Contrast', 'cause-effect': 'Cause & effect', sequence: 'Sequence',
  example: 'Example', conclusion: 'Conclusion', condition: 'Condition', comparison: 'Comparison', conjunction: 'Conjunction'
};

export const ConnectorsPage: React.FC = () => {
  const pageSize = 6;
  const [connector, setConnector] = useState('');
  const [preview, setPreview] = useState<ConnectorLookupPreview | null>(null);
  const [entries, setEntries] = useState<ConnectorEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ConnectorCategory | 'all'>('all');
  const [page, setPage] = useState(0);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ConnectorEntry | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string; suggestions?: string[] } | null>(null);
  const listSequence = useRef(0);

  const loadEntries = useCallback(async () => {
    const requestId = ++listSequence.current;
    setLoading(true);
    try {
      const result = await window.studydockBridge.connectorsList({
        category: category === 'all' ? undefined : category,
        search,
        offset: page * pageSize,
        limit: pageSize
      });
      if (requestId === listSequence.current) { setEntries(result.entries); setTotal(result.total); }
    } catch (error: unknown) {
      if (requestId === listSequence.current) setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load your connector library.' });
    } finally {
      if (requestId === listSequence.current) setLoading(false);
    }
  }, [category, page, search]);

  useEffect(() => { void loadEntries(); }, [loadEntries, reloadVersion]);
  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected]);

  const lookup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!connector.trim() || lookingUp) return;
    setLookingUp(true);
    setPreview(null);
    setFeedback(null);
    try {
      const result = await window.studydockBridge.connectorsLookup({ connector });
      if (result.status === 'unrecognized') {
        setFeedback({
          kind: result.suggestions?.length ? 'success' : 'error',
          message: result.suggestions?.length ? `“${result.connector}” isn't a connector. You could try:` : `Gemini couldn't confirm “${result.connector}” as a connector. It wasn't saved.`,
          suggestions: result.suggestions
        });
      } else if (result.status === 'duplicate') {
        setFeedback({ kind: 'success', message: `“${result.entry.connector}” is already in your connector library.` });
      } else setPreview(result);
    } catch (error: unknown) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'The lookup failed. Please try again.' });
    } finally { setLookingUp(false); }
  };

  const savePreview = async () => {
    if (!preview || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const result = await window.studydockBridge.connectorsSavePreview(preview.token);
      setPreview(null);
      setConnector('');
      setPage(0);
      setFeedback({ kind: 'success', message: result.status === 'saved' ? `“${result.entry.connector}” was saved to your connector library.` : `“${result.entry.connector}” is already in your connector library.` });
      setReloadVersion(current => current + 1);
    } catch (error: unknown) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Could not save this connector.' });
    } finally { setSaving(false); }
  };

  const refreshExamples = async (entry: ConnectorEntry) => {
    if (refreshingId) return;
    setRefreshingId(entry.id);
    setFeedback(null);
    try {
      const updated = await window.studydockBridge.connectorsRefreshExamples(entry.id);
      setEntries(current => current.map(item => item.id === updated.id ? updated : item));
      setSelected(current => current?.id === updated.id ? updated : current);
      setFeedback({ kind: 'success', message: `Refreshed six example sentences for “${updated.connector}”.` });
    } catch (error: unknown) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Could not refresh the examples.' });
    } finally { setRefreshingId(null); }
  };

  const renderExamples = (examples: Array<{ id?: string; example: string; voice: string }>) => <div className="expression-examples">{examples.map((item, index) => <p key={item.id || `${index}-${item.example}`}><span className={`expression-example-voice ${item.voice}`}>{item.voice}</span>“{item.example}”</p>)}</div>;

  return <div className="connectors-page">
    <header className="connectors-heading"><span className="connectors-icon"><Workflow size={24} /></span><div><h1>Connectors</h1><p>Learn words and phrases that connect clauses, sentences, and ideas.</p></div><span className="badge badge-saved connectors-count">{total} saved</span></header>

    <section className="card connectors-lookup">
      <h2><Plus size={18} />Look up a connector</h2>
      <p>Gemini identifies how the connector links ideas and creates six examples. Review the preview, then choose whether to save it. Lookups require internet access and may use your Gemini quota.</p>
      <form onSubmit={lookup} className="connectors-lookup-form">
        <label className="input-group"><span className="input-label">Word or phrase</span><input className="input-text" value={connector} maxLength={120} disabled={lookingUp || saving} placeholder="e.g. however, because, in addition" onChange={event => { setConnector(event.target.value); setPreview(null); setFeedback(null); }} /></label>
        <button className="btn btn-primary" type="submit" disabled={!connector.trim() || lookingUp || saving}>{lookingUp ? <span className="spinner" /> : <Search size={17} />}{lookingUp ? 'Looking up…' : 'Look up'}</button>
      </form>
      {feedback && <div className={`expressions-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.kind === 'error' ? <AlertCircle size={17} /> : <CheckCircle size={17} />}<div>{feedback.message}{feedback.suggestions && <div className="connector-suggestions">{feedback.suggestions.map(suggestion => <button key={suggestion} type="button" className="btn btn-secondary btn-sm" onClick={() => { setConnector(suggestion); setFeedback(null); }}>{suggestion}</button>)}</div>}</div></div>}
      {preview && <article className="card connector-preview" aria-live="polite">
        <div className="connector-entry-heading"><div><span className="expression-type-label">Preview · {categoryNames[preview.category]}</span><h3>{preview.connector}</h3></div><span className="expression-language">{preview.language.toUpperCase()}</span></div>
        <p className="expression-meaning">{preview.meaning}</p>{renderExamples(preview.examples)}
        <div className="expression-preview-actions"><button className="btn btn-primary" onClick={() => void savePreview()} disabled={saving}>{saving ? <span className="spinner" /> : <Plus size={16} />}{saving ? 'Saving…' : 'Save to Library'}</button><button className="btn btn-secondary" onClick={() => setPreview(null)} disabled={saving}>Discard preview</button></div>
      </article>}
    </section>

    <section className="connectors-library">
      <div className="connectors-library-heading"><div><h2><Workflow size={19} />Your connector library</h2><p>Saved connectors are available offline.</p></div><label className="connectors-category-filter"><span className="sr-only">Filter connector category</span><select className="input-text" value={category} onChange={event => { setPage(0); setCategory(event.target.value as ConnectorCategory | 'all'); }}><option value="all">All categories</option>{CONNECTOR_CATEGORIES.map(item => <option key={item} value={item}>{categoryNames[item]}</option>)}</select></label></div>
      <label className="expressions-search"><Search size={17} /><span className="sr-only">Search saved connectors</span><input value={search} onChange={event => { setPage(0); setSearch(event.target.value); }} placeholder="Search connectors…" /></label>
      {loading ? <div className="card expressions-empty"><span className="spinner" /><p>Loading saved connectors…</p></div> : entries.length === 0 ? <div className="card expressions-empty"><Workflow size={28} /><h3>{total === 0 ? 'Your connector library is ready' : 'No matching connectors'}</h3><p>{total === 0 ? 'Look up a connector above to start your collection.' : 'Try another search or category.'}</p></div> : <div className="connectors-grid">{entries.map(entry => <article className="card expression-card" key={entry.id}>
        <div className="connector-entry-heading"><div><span className="expression-type-label">{categoryNames[entry.category]}</span><h3><button className="expression-open-button" onClick={() => setSelected(entry)}>{entry.connector}</button></h3></div><span className="expression-language">{entry.language.toUpperCase()}</span></div>
        <p className="expression-meaning">{entry.meaning}</p>
        <p className="connector-example-count">{entry.examples.length} examples · Select the connector to view the full card</p>
      </article>)}</div>}
      {!loading && total > 0 && <div className="expressions-pagination"><span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}</span><div><button className="btn btn-secondary btn-sm" onClick={() => setPage(current => Math.max(current - 1, 0))} disabled={page === 0}><ArrowLeft size={15} />Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(total / pageSize))}</span><button className="btn btn-secondary btn-sm" onClick={() => setPage(current => current + 1)} disabled={(page + 1) * pageSize >= total}>Next<ArrowRight size={15} /></button></div></div>}
    </section>

    {selected && <div className="modal-backdrop expression-detail-backdrop" onClick={() => setSelected(null)}><section className="modal-content expression-detail-modal" role="dialog" aria-modal="true" aria-labelledby="connector-detail-title" onClick={event => event.stopPropagation()}>
      <div className="expression-detail-header"><div><span className="expression-type-label">{categoryNames[selected.category]}</span><span className="expression-language">{selected.language.toUpperCase()}</span></div><button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)} aria-label="Close connector card" autoFocus><X size={20} /></button></div>
      <h2 id="connector-detail-title" className="expression-detail-title">{selected.connector}</h2>
      <section className="expression-detail-meaning"><h3>Meaning and use</h3><p>{selected.meaning}</p></section>
      <section className="expression-detail-examples"><div className="expression-detail-examples-heading"><h3>Examples <span className="badge badge-saved">{selected.examples.length}</span></h3><button className="btn btn-secondary btn-sm expression-refresh-button" onClick={() => void refreshExamples(selected)} disabled={refreshingId !== null} aria-label={`Refresh six example sentences for ${selected.connector}`}>{refreshingId === selected.id ? <span className="spinner" /> : <RefreshCw size={15} />}{refreshingId === selected.id ? 'Refreshing…' : 'Refresh sentences'}</button></div>{renderExamples(selected.examples)}
        {feedback && <div className={`expressions-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.kind === 'error' ? <AlertCircle size={17} /> : <CheckCircle size={17} />}{feedback.message}</div>}
      </section>
    </section></div>}
  </div>;
};

export default ConnectorsPage;
