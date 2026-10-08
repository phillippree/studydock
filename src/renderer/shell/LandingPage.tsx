import React, { useState, useEffect, useRef } from 'react';
import { getAllRegisteredModes } from './modeRegistry';
import {
  BookOpen,
  Brain,
  Quote,
  ArrowRight,
  Key,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  CheckCircle,
  AlertCircle,
  FolderOpen,
  Workflow,
  Eye,
  EyeOff,
  Trash2,
  Cpu,
  Laugh
} from 'lucide-react';
import { AvailableModel, DEFAULT_GEMINI_MODEL, GeminiSettings, SUPPORTED_GEMINI_MODELS, TestConnectionResult } from '../../shared/contracts/settings';

interface LandingPageProps {
  onOpenMode: (modeId: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenMode }) => {
  const modes = getAllRegisteredModes();
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const settingsInitialized = useRef(false);
  const [settings, setSettings] = useState<GeminiSettings | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_GEMINI_MODEL);
  const [sessionOnly, setSessionOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const [modelOptions, setModelOptions] = useState<AvailableModel[]>(SUPPORTED_GEMINI_MODELS);

  const handleRefreshModels = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const result = await window.studydockBridge.listModels(keyInput.trim() || undefined);
      if (!result.success) { setMessage({ type: 'error', text: result.error || 'Unable to refresh models.' }); return; }
      setModelOptions(result.models);
      setTestResult(null);
      setMessage({ type: 'info', text: result.models.length ? 'Models refreshed. Select a model and test it to confirm generation access.' : 'No compatible text models were returned for this key.' });
    } catch { setMessage({ type: 'error', text: 'Unable to refresh models. Try again.' }); }
    finally { setIsLoading(false); }
  };

  const loadSettings = async () => {
    try {
      if (window.studydockBridge) {
        const s = await window.studydockBridge.getSettings();
        setSettings(s);
        if (!settingsInitialized.current || !s.hasKey) {
          setSettingsExpanded(!s.hasKey);
          settingsInitialized.current = true;
        }
        setSelectedModel(s.model || DEFAULT_GEMINI_MODEL);
        setSessionOnly(s.isSessionOnly);
      }
    } catch (err: unknown) {
      setMessage({ type: 'error', text: 'Unable to load application settings. Restart StudyDock and try again.' });
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSaveKey = async () => {
    if (!keyInput.trim()) {
      setMessage({ type: 'error', text: 'Please enter a Gemini API key.' });
      return;
    }

    setIsLoading(true);
    setMessage(null);
    setTestResult(null);

    try {
      const res = await window.studydockBridge.saveApiKey({
        apiKey: keyInput.trim(),
        sessionOnly
      });

      if (res.success) {
        setMessage({ type: 'success', text: 'API key saved successfully.' });
        setKeyInput('');
        await loadSettings();
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to save API key.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving key';
      setMessage({ type: 'error', text: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveKey = async () => {
    setIsLoading(true);
    setMessage(null);
    setTestResult(null);
    try {
      await window.studydockBridge.removeApiKey();
      setMessage({ type: 'info', text: 'API key removed.' });
      setKeyInput('');
      await loadSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error removing key';
      setMessage({ type: 'error', text: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setIsLoading(true);
    setTestResult(null);
    setMessage(null);

    try {
      // If user typed a key in input, test with that, otherwise test saved key
      const result = await window.studydockBridge.testConnection(selectedModel, keyInput.trim() || undefined);
      setTestResult(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection test failed';
      setTestResult({
        success: false,
        message: msg
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleModelChange = async (newModel: string) => {
    setSelectedModel(newModel);
    setTestResult(null);
    try {
      await window.studydockBridge.setModel(newModel);
      await loadSettings();
    } catch (err) {
      setMessage({ type: 'error', text: 'Unable to save the selected model.' });
    }
  };

  const handleOpenStorageFolder = async () => {
    try {
      await window.studydockBridge.openStorageFolder();
    } catch (err) {
      console.error('Failed to open storage folder:', err);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0', padding: '40px 24px' }}>
      {/* Hero Welcome */}
      <div style={{ textAlign: 'left', marginBottom: '28px' }}>
        <h1 style={{ fontSize: '1.9rem', fontWeight: 500, letterSpacing: '-0.03em', marginBottom: '8px' }}>
          What would you like to learn?
        </h1>
        <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', maxWidth: '540px', margin: '0' }}>
          Choose a mode to get started.
        </p>
      </div>

      {/* Mode Selection Cards */}
      <div style={{ marginBottom: '48px' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '14px' }}>
          Available modes
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {modes.map(mode => (
            <div
              key={mode.id}
              className={`card${mode.comingSoon ? '' : ' card-interactive'}`}
              onClick={mode.comingSoon ? undefined : () => onOpenMode(mode.id)}
              aria-disabled={mode.comingSoon || undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '180px',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-card)'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--info-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-primary)'
                  }}>
                    {mode.iconName === 'Brain' ? <Brain size={22} /> : mode.iconName === 'Quote' ? <Quote size={22} /> : mode.iconName === 'Workflow' ? <Workflow size={22} /> : mode.iconName === 'Laugh' ? <Laugh size={22} /> : <BookOpen size={22} />}
                  </div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{mode.displayName}</h3>
                  {mode.comingSoon && <span className="badge badge-warning">Coming soon</span>}
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {mode.description}
                </p>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                {!mode.comingSoon && <button
                  className="btn btn-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenMode(mode.id);
                  }}
                >
                  <span>Open {mode.displayName.toLowerCase()}</span>
                  <ArrowRight size={16} />
                </button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gemini Connection & Settings Section */}
      <div className="card" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: settingsExpanded ? '20px' : '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sparkles size={22} color="var(--accent-primary)" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Gemini connection</h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {settings?.hasKey ? (
              <span className="badge badge-saved">
                <CheckCircle size={12} />
                Key Configured
              </span>
            ) : (
              <span className="badge badge-warning">
                <AlertCircle size={12} />
                Key Not Set
              </span>
            )}
            <button type="button" className="btn btn-secondary btn-sm" aria-expanded={settingsExpanded} aria-controls="gemini-settings-panel" onClick={() => setSettingsExpanded(open => !open)}>
              {settingsExpanded ? 'Hide settings ▴' : 'Edit settings ▾'}
            </button>
          </div>
        </div>

        <p className="gemini-summary">
          {modelOptions.find(model => model.id === selectedModel)?.name || selectedModel}
          {' · '}{settings?.hasKey ? (settings.isSessionOnly ? 'Session only' : 'Encrypted on this device') : 'Add a key to get started'}
        </p>
        <div id="gemini-settings-panel" hidden={!settingsExpanded}>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.5 }}>
          StudyDock works completely offline with saved words. Fetching new definitions sends the selected word to the Gemini API. Your API key is encrypted on your machine using OS-backed secure storage.
        </p>

        {/* API Key Input */}
        <div className="input-group">
          <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Gemini API Key</span>
            {settings?.hasKey && (
              <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                Current: {settings.apiKeyMasked}
              </span>
            )}
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type={showKey ? 'text' : 'password'}
                className="input-text input-mono"
                placeholder={settings?.hasKey ? 'Enter new API key to replace existing...' : 'Paste your AIzaSy... API key'}
                value={keyInput}
                onChange={(e) => { setKeyInput(e.target.value); setTestResult(null); }}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowKey(!showKey)}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', padding: '4px' }}
                title={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>

        {/* Storage Option & Model Selection Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          {/* Model Selector */}
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Gemini Model</label>
            <div style={{ position: 'relative' }}>
              <select
                className="select-input"
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
              >
                {!modelOptions.some(m => m.id === selectedModel) && <option value={selectedModel}>{selectedModel} (saved; access unverified)</option>}
                {modelOptions.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.isRecommended ? '⭐ (Recommended)' : ''}
                  </option>
                ))}
              </select>
              <button className="btn btn-ghost btn-sm" onClick={handleRefreshModels} disabled={isLoading || (!keyInput.trim() && !settings?.hasKey)}>Refresh available models</button>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Older 2.5 models may be restricted. Choose 3.5 Flash-Lite for a new project. Refresh uses the entered or saved key without saving it.</p>
            </div>
          </div>

          {/* Key Storage Mode Indicator */}
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Key Persistence</label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)'
            }}>
              {settings?.isEncryptionAvailable ? (
                <>
                  <ShieldCheck size={18} color="var(--success-text)" />
                  <span>OS-backed encrypted storage</span>
                </>
              ) : (
                <>
                  <ShieldAlert size={18} color="var(--warning-text)" />
                  <span>Session memory only (OS keyring unavailable)</span>
                </>
              )}
            </div>
          </div>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '12px' }}>Test the entered key without saving it, or test your saved key when the field is empty. Testing sends a small request to Gemini and may incur API usage.</p>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
          <button
            className="btn btn-primary"
            onClick={handleSaveKey}
            disabled={isLoading || !keyInput.trim()}
          >
            <Key size={16} />
            {settings?.hasKey ? 'Replace Key' : 'Save Key'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleTestConnection}
            disabled={isLoading || (!settings?.hasKey && !keyInput.trim())}
          >
            {isLoading ? <div className="spinner" /> : <Cpu size={16} />}
            {isLoading ? 'Please wait…' : 'Test Connection'}
          </button>

          {settings?.hasKey && (
            <button
              className="btn btn-danger"
              onClick={handleRemoveKey}
              disabled={isLoading}
            >
              <Trash2 size={16} />
              Remove Key
            </button>
          )}

          <div style={{ marginLeft: 'auto' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleOpenStorageFolder}
              title="Reveal application database and settings in Finder / File Explorer"
            >
              <FolderOpen size={16} />
              Open Data Folder
            </button>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            background: message.type === 'success' ? 'var(--success-bg)' : message.type === 'error' ? 'var(--error-bg)' : 'var(--info-bg)',
            border: `1px solid ${message.type === 'success' ? 'var(--success-border)' : message.type === 'error' ? 'var(--error-border)' : 'var(--info-border)'}`,
            color: message.type === 'success' ? 'var(--success-text)' : message.type === 'error' ? 'var(--error-text)' : 'var(--info-text)',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px'
          }}>
            {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Connection Test Result */}
        {testResult && (
          <div style={{
            padding: '14px 18px',
            borderRadius: 'var(--radius-md)',
            background: testResult.success ? 'var(--success-bg)' : 'var(--error-bg)',
            border: `1px solid ${testResult.success ? 'var(--success-border)' : 'var(--error-border)'}`,
            color: testResult.success ? 'var(--success-text)' : 'var(--error-text)',
            fontSize: '0.875rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, marginBottom: '4px' }}>
              {testResult.success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
              <span>{testResult.success ? 'Connection Successful' : 'Connection Test Failed'}</span>
              {testResult.latencyMs !== undefined && (
                <span style={{ fontSize: '0.75rem', opacity: 0.8, marginLeft: 'auto' }}>
                  Latency: {testResult.latencyMs}ms
                </span>
              )}
            </div>
            <div style={{ opacity: 0.9 }}>{testResult.message}</div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
