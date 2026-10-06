import React, { useEffect, useState, Suspense } from 'react';
import { LandingPage } from './LandingPage';
import { ModePicker } from './ModePicker';
import { ErrorBoundary } from './ErrorBoundary';
import { getModeComponent } from './modeRegistry';
import { Compass } from 'lucide-react';
import packageJson from '../../../package.json';
import { UpdateCheckResult } from '../../shared/contracts/updates';

export const App: React.FC = () => {
  const [currentModeId, setCurrentModeId] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateCheckResult['status']>('unavailable');
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [updateLinkError, setUpdateLinkError] = useState(false);

  useEffect(() => {
    let active = true;
    window.studydockBridge.checkForUpdates()
      .then(result => {
        if (!active) return;
        setUpdateStatus(result.status);
        setLatestVersion('latestVersion' in result ? result.latestVersion : null);
      })
      .catch(() => {
        if (active) setUpdateStatus('unavailable');
      });
    return () => { active = false; };
  }, []);

  const handleOpenUpdate = async () => {
    try {
      await window.studydockBridge.openLatestRelease();
      setUpdateLinkError(false);
    } catch {
      setUpdateLinkError(true);
    }
  };

  const ModeComponent = currentModeId ? getModeComponent(currentModeId) : null;

  return (
    <div className="app-shell">
      {/* Top Application Header */}
      <header className="app-header">
        <div className="app-header-left">
          <button
            type="button"
            className="brand-title"
            onClick={() => setCurrentModeId(null)}
            title="StudyDock Home"
          >
            <Compass className="brand-icon" />
            <span>StudyDock</span>
          </button>
        </div>

        <nav className="app-header-nav">
          <ModePicker
            currentModeId={currentModeId}
            onSelectMode={(modeId) => setCurrentModeId(modeId)}
          />
        </nav>
      </header>

      {/* Main Content Body */}
      <main className="app-main">
        {currentModeId === null || !ModeComponent ? (
          <LandingPage onOpenMode={(modeId) => setCurrentModeId(modeId)} />
        ) : (
          <ErrorBoundary
            key={currentModeId}
            onGoHome={() => setCurrentModeId(null)}
            onReset={() => {}}
          >
            <Suspense
              fallback={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px' }}>
                  <div className="spinner" style={{ width: '32px', height: '32px' }} />
                </div>
              }
            >
              <ModeComponent onNavigateHome={() => setCurrentModeId(null)} />
            </Suspense>
          </ErrorBoundary>
        )}
      </main>
      <footer className="app-footer">
        <span>Local learning libraries · Gemini for new lookups</span>
        <div className="app-footer-version" aria-live="polite">
          {updateStatus === 'available' && latestVersion && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleOpenUpdate}>
              Update to {latestVersion}
            </button>
          )}
          <span title={updateLinkError ? 'Could not open the GitHub release page.' : undefined}>Version {packageJson.version}</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
