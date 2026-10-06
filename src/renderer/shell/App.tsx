import React, { useState, Suspense } from 'react';
import { LandingPage } from './LandingPage';
import { ModePicker } from './ModePicker';
import { ErrorBoundary } from './ErrorBoundary';
import { getModeComponent } from './modeRegistry';
import { Compass } from 'lucide-react';

export const App: React.FC = () => {
  const [currentModeId, setCurrentModeId] = useState<string | null>(null);

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
      <footer className="app-footer">Local word library · Gemini for new definitions</footer>
    </div>
  );
};

export default App;
