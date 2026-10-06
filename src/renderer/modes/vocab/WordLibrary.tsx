import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Search,
  Upload,
  Download,
  Trash2,
  Edit2,
  CheckCircle,
  AlertTriangle,
  Book,
  FileText,
  Save,
  RotateCcw
} from 'lucide-react';
import {
  PartOfSpeech,
  VocabDefinition,
  VocabWord,
  ImportWordsResult
} from '../../../shared/contracts/vocab';

interface WordLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectWord: (wordId: string) => void;
  onWordListChanged: () => void;
  definedWordsOnly?: boolean;
}

type LibraryTab = 'words' | 'import' | 'add';

export const WordLibrary: React.FC<WordLibraryProps> = ({
  isOpen,
  onClose,
  onSelectWord,
  onWordListChanged,
  definedWordsOnly = false
}) => {
  const [activeTab, setActiveTab] = useState<LibraryTab>('words');
  const [words, setWords] = useState<Array<VocabWord & { definitionCount: number }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Add word state
  const [newWordText, setNewWordText] = useState('');
  const [addFeedback, setAddFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isVerifyingWord, setIsVerifyingWord] = useState(false);

  // Edit word state
  const [editingWord, setEditingWord] = useState<VocabWord | null>(null);
  const [editWordText, setEditWordText] = useState('');
  const [editingDefinitions, setEditingDefinitions] = useState<VocabDefinition[]>([]);
  const [isEditingDefMode, setIsEditingDefMode] = useState(false);

  // Add manual definition state
  const [newDefPos, setNewDefPos] = useState<PartOfSpeech>('noun');
  const [newDefText, setNewDefText] = useState('');
  const [newDefExample, setNewDefExample] = useState('');

  // Import state
  const [importContent, setImportContent] = useState('');
  const [importResult, setImportResult] = useState<ImportWordsResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Undo delete state
  const [deletedWordUndo, setDeletedWordUndo] = useState<{ word: VocabWord; definitions: VocabDefinition[] } | null>(null);

  const loadWords = async () => {
    setIsLoading(true);
    try {
      if (window.studydockBridge) {
        const list = await window.studydockBridge.vocabGetAllWords();
        setWords(list);
      }
    } catch (err) {
      console.error('Failed to load words:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadWords();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredWords = words.filter(w =>
    w.displayWord.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.normalizedWord.includes(searchQuery.toLowerCase())
  ).filter(w => !definedWordsOnly || w.definitionCount > 0);

  const handleAddWord = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newWordText.trim();
    if (!trimmed) {
      setAddFeedback({ type: 'error', text: 'Enter a word or phrase above, then choose Add Word.' });
      return;
    }

    setAddFeedback(null);
    setIsVerifyingWord(true);
    try {
      const result = await window.studydockBridge.vocabVerifyAndAddWord({ word: trimmed });
      if (result.status === 'duplicate') {
        setAddFeedback({ type: 'error', text: `"${result.word.displayWord}" is already in your word library.` });
      } else if (result.status === 'unrecognized') {
        const suggestion = result.suggestedWord ? ` Did you mean "${result.suggestedWord}"?` : '';
        setAddFeedback({ type: 'error', text: `Gemini couldn't confirm "${result.enteredWord}" as a recognized word or phrase, so it wasn't added.${suggestion}` });
      } else {
        setAddFeedback({ type: 'success', text: `"${result.word.displayWord}" added with ${result.definitions.length} definition${result.definitions.length === 1 ? '' : 's'} and six examples per definition.` });
        setNewWordText('');
        await loadWords();
        onWordListChanged();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add word';
      setAddFeedback({ type: 'error', text: msg });
    } finally {
      setIsVerifyingWord(false);
    }
  };

  const handleStartEdit = async (word: VocabWord) => {
    setEditingWord(word);
    setEditWordText(word.displayWord);
    setIsEditingDefMode(false);
    try {
      const details = await window.studydockBridge.vocabGetWordDetails(word.id);
      if (details) {
        setEditingDefinitions(details.definitions);
      }
    } catch (err) {
      console.error('Failed to load word details:', err);
    }
  };

  const handleSaveWordEdit = async () => {
    if (!editingWord || !editWordText.trim()) return;

    try {
      await window.studydockBridge.vocabEditWord({
        id: editingWord.id,
        displayWord: editWordText.trim()
      });
      setEditingWord(null);
      await loadWords();
      onWordListChanged();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update word');
    }
  };

  const handleDeleteWord = async (wordId: string) => {
    try {
      const details = await window.studydockBridge.vocabGetWordDetails(wordId);
      const res = await window.studydockBridge.vocabDeleteWord(wordId);
      if (res.success && details) {
        setDeletedWordUndo({ word: res.deletedWord, definitions: details.definitions });
        await loadWords();
        onWordListChanged();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete word');
    }
  };

  const handleUndoDelete = async () => {
    if (!deletedWordUndo) return;
    try {
      const created = await window.studydockBridge.vocabAddWord({ word: deletedWordUndo.word.displayWord });
      for (const def of deletedWordUndo.definitions) {
        await window.studydockBridge.vocabAddDefinition({
          wordId: created.word.id,
          partOfSpeech: def.partOfSpeech,
          definition: def.definition,
          example: def.example,
          examples: def.examples,
          source: def.source
        });
      }
      setDeletedWordUndo(null);
      await loadWords();
      onWordListChanged();
    } catch (err) {
      console.error('Failed to undo delete:', err);
    }
  };

  const handleAddManualDefinition = async () => {
    if (!editingWord || !newDefText.trim()) return;
    try {
      const def = await window.studydockBridge.vocabAddDefinition({
        wordId: editingWord.id,
        partOfSpeech: newDefPos,
        definition: newDefText.trim(),
        example: newDefExample.trim() || 'No example provided.',
        source: 'manual'
      });
      setEditingDefinitions([...editingDefinitions, def]);
      setNewDefText('');
      setNewDefExample('');
      await loadWords();
      onWordListChanged();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add definition');
    }
  };

  const handleDeleteDefinition = async (defId: string) => {
    try {
      await window.studydockBridge.vocabDeleteDefinition(defId);
      setEditingDefinitions(editingDefinitions.filter(d => d.id !== defId));
      await loadWords();
      onWordListChanged();
    } catch (err) {
      console.error('Failed to delete definition:', err);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setImportContent(text);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleRunImport = async () => {
    if (!importContent.trim()) return;

    setIsLoading(true);
    setImportResult(null);

    try {
      const result = await window.studydockBridge.vocabImportWords(importContent);
      setImportResult(result);
      if (result.imported > 0) {
        await loadWords();
        onWordListChanged();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const data = await window.studydockBridge.vocabExportData();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `studydock-vocab-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Export failed');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '840px', width: '90vw', height: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Book size={24} color="var(--accent-primary)" />
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>Word Library</h2>
            <span className="badge badge-gemini" style={{ textTransform: 'none' }}>
              {words.length} {words.length === 1 ? 'word' : 'words'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="btn btn-ghost btn-sm" onClick={handleExport} title="Export word library as JSON">
              <Download size={16} />
              Export
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose} title="Close library">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', padding: '14px 0', borderBottom: '1px solid var(--border-subtle)' }}>
          <button
            className={`btn btn-sm ${activeTab === 'words' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setActiveTab('words'); setEditingWord(null); }}
          >
            <Book size={16} />
            All Words
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'add' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setActiveTab('add'); setEditingWord(null); }}
          >
            <Plus size={16} />
            Add Word
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'import' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setActiveTab('import'); setEditingWord(null); }}
          >
            <Upload size={16} />
            Import Words
          </button>
        </div>

        {/* Undo notification banner */}
        {deletedWordUndo && (
          <div style={{
            margin: '12px 0',
            padding: '10px 16px',
            background: 'var(--warning-bg)',
            border: '1px solid var(--warning-border)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.875rem',
            color: 'var(--warning-text)'
          }}>
            <span>Word <strong>"{deletedWordUndo.word.displayWord}"</strong> was deleted.</span>
            <button className="btn btn-secondary btn-sm" onClick={handleUndoDelete} style={{ gap: '4px' }}>
              <RotateCcw size={14} />
              Undo
            </button>
          </div>
        )}

        {/* Tab 1: All Words List */}
        {activeTab === 'words' && !editingWord && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingTop: '12px' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
              <input
                type="text"
                className="input-text"
                placeholder="Search words..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '38px' }}
              />
            </div>

            {/* Words Table / Scroll Area */}
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
              {filteredWords.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                  <p style={{ marginBottom: '12px' }}>No words found matching "{searchQuery}".</p>
                  <button className="btn btn-primary btn-sm" onClick={() => setActiveTab('add')}>
                    <Plus size={16} />
                    Add a New Word
                  </button>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-default)' }}>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Word</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Definitions</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Language</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWords.map((word) => (
                      <tr
                        key={word.id}
                        style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', transition: 'background 0.15s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        onClick={() => {
                          onSelectWord(word.id);
                          onClose();
                        }}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {word.displayWord}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {word.definitionCount > 0 ? (
                            <span className="badge badge-saved" style={{ fontSize: '0.7rem' }}>
                              {word.definitionCount} saved
                            </span>
                          ) : (
                            <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                              Not defined
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                          {word.language.toUpperCase()}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleStartEdit(word)}
                              title="Edit word or definitions"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleDeleteWord(word.id)}
                              title="Delete word"
                              style={{ color: 'var(--error-text)' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Tab: Editing Word Details */}
        {editingWord && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Edit Word: {editingWord.displayWord}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingWord(null)}>
                Back to List
              </button>
            </div>

            <div className="input-group">
              <label className="input-label">Word Text</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="input-text"
                  value={editWordText}
                  onChange={(e) => setEditWordText(e.target.value)}
                />
                <button className="btn btn-primary" onClick={handleSaveWordEdit}>
                  <Save size={16} />
                  Save Word
                </button>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                Note: Renaming a word removes previously attached definitions to prevent mismatched meanings.
              </span>
            </div>

            {/* Saved Definitions for Word */}
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Definitions ({editingDefinitions.length})</h4>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setIsEditingDefMode(!isEditingDefMode)}
                >
                  <Plus size={14} />
                  Add Manual Definition
                </button>
              </div>

              {isEditingDefMode && (
                <div style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px', marginBottom: '10px' }}>
                    <select
                      className="select-input"
                      value={newDefPos}
                      onChange={(e) => setNewDefPos(e.target.value as PartOfSpeech)}
                    >
                      <option value="noun">Noun</option>
                      <option value="verb">Verb</option>
                      <option value="adjective">Adjective</option>
                      <option value="adverb">Adverb</option>
                      <option value="idiom">Idiom</option>
                      <option value="phrase">Phrase</option>
                      <option value="other">Other</option>
                    </select>
                    <input
                      type="text"
                      className="input-text"
                      placeholder="Definition text..."
                      value={newDefText}
                      onChange={(e) => setNewDefText(e.target.value)}
                    />
                  </div>
                  <input
                    type="text"
                    className="input-text"
                    placeholder="Example sentence..."
                    value={newDefExample}
                    onChange={(e) => setNewDefExample(e.target.value)}
                    style={{ marginBottom: '10px' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setIsEditingDefMode(false)}>
                      Cancel
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={handleAddManualDefinition}>
                      Save Definition
                    </button>
                  </div>
                </div>
              )}

              {editingDefinitions.length === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>No definitions saved for this word yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {editingDefinitions.map((def) => (
                    <div
                      key={def.id}
                      style={{
                        padding: '12px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '12px'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontStyle: 'italic', fontWeight: 600, color: 'var(--accent-secondary)', fontSize: '0.85rem' }}>
                            {def.partOfSpeech}
                          </span>
                          <span className="badge badge-saved" style={{ fontSize: '0.65rem' }}>
                            {def.source}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.9rem', marginBottom: '4px' }}>{def.definition}</p>
                        {(def.examples?.length ? def.examples : [{ example: def.example, voice: 'other' as const }]).map((item, index) => (
                          <p key={`${def.id}-example-${index}`} style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '4px' }}>
                            <span className="example-voice">{item.voice}</span> “{item.example}”
                          </p>
                        ))}
                      </div>

                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleDeleteDefinition(def.id)}
                        title="Delete definition"
                        style={{ color: 'var(--error-text)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Add Word */}
        {activeTab === 'add' && (
          <div style={{ flex: 1, paddingTop: '16px' }}>
            <form onSubmit={handleAddWord} style={{ maxWidth: '480px' }}>
              <div className="input-group">
                <label className="input-label" htmlFor="new-vocabulary-word">Word or Term</label>
                <input
                  id="new-vocabulary-word"
                  type="text"
                  className="input-text"
                  placeholder="e.g. serendipity, epiphany, resilient"
                  value={newWordText}
                  disabled={isVerifyingWord}
                  onChange={(e) => {
                    setNewWordText(e.target.value);
                    if (addFeedback) setAddFeedback(null);
                  }}
                  aria-describedby="add-word-help"
                  autoFocus
                />
                <p id="add-word-help" style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '6px' }}>
                  Type a word or phrase first. You can add its definition afterward.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button type="submit" className="btn btn-primary" disabled={isVerifyingWord}>
                  {isVerifyingWord ? <div className="spinner" /> : <Plus size={16} />}
                  {isVerifyingWord ? 'Checking with Gemini…' : 'Add Word'}
                </button>
              </div>

              {addFeedback && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: addFeedback.type === 'success' ? 'var(--success-bg)' : 'var(--error-bg)',
                  border: `1px solid ${addFeedback.type === 'success' ? 'var(--success-border)' : 'var(--error-border)'}`,
                  color: addFeedback.type === 'success' ? 'var(--success-text)' : 'var(--error-text)',
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }} role={addFeedback.type === 'error' ? 'alert' : 'status'}>
                  {addFeedback.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                  <span>{addFeedback.text}</span>
                </div>
              )}
            </form>
          </div>
        )}

        {/* Tab 3: Import Words */}
        {activeTab === 'import' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingTop: '16px' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Import words from a UTF-8 text file (one word per line) or paste them directly below.
            </p>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
              <input
                type="file"
                ref={fileInputRef}
                accept=".txt,.csv"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileText size={16} />
                Choose Text File
              </button>
            </div>

            <div className="input-group" style={{ flex: 1 }}>
              <textarea
                className="textarea-input input-mono"
                rows={8}
                placeholder="ephemeral&#10;mellifluous&#10;catalyst&#10;ubiquitous"
                value={importContent}
                onChange={(e) => setImportContent(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
              <button
                className="btn btn-primary"
                onClick={handleRunImport}
                disabled={isLoading || !importContent.trim()}
              >
                {isLoading ? <div className="spinner" /> : <Upload size={16} />}
                Import Words
              </button>
            </div>

            {importResult && (
              <div style={{
                padding: '14px 18px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.875rem'
              }}>
                <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
                  Import Summary
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', textAlign: 'center' }}>
                  <div style={{ padding: '8px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{importResult.total}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Total Read</div>
                  </div>
                  <div style={{ padding: '8px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--success-text)' }}>{importResult.imported}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Imported</div>
                  </div>
                  <div style={{ padding: '8px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--warning-text)' }}>{importResult.duplicates}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Duplicates</div>
                  </div>
                  <div style={{ padding: '8px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--error-text)' }}>{importResult.rejected}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Rejected</div>
                  </div>
                </div>

                {importResult.errors && importResult.errors.length > 0 && (
                  <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--error-text)' }}>
                    {importResult.errors.map((e, idx) => (
                      <div key={idx}>• {e}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
