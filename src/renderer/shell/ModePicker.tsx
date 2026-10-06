import React, { useState, useRef, useEffect } from 'react';
import { getAllRegisteredModes } from './modeRegistry';
import { BookOpen, Brain, ChevronDown, Check, Home, Layers } from 'lucide-react';

interface ModePickerProps {
  currentModeId: string | null;
  onSelectMode: (modeId: string | null) => void;
}

export const ModePicker: React.FC<ModePickerProps> = ({ currentModeId, onSelectMode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modes = getAllRegisteredModes();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentMode = modes.find(m => m.id === currentModeId);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <button
        className={`btn btn-sm ${currentModeId === null ? 'btn-primary' : 'btn-ghost'}`}
        onClick={() => onSelectMode(null)}
        title="Go to Home & Settings"
      >
        <Home size={16} />
        Home
      </button>

      {modes.length === 1 ? (
        <button
          className={`btn btn-sm ${currentModeId === modes[0].id ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => onSelectMode(modes[0].id)}
        >
          {modes[0].iconName === 'Brain' ? <Brain size={16} /> : <BookOpen size={16} />}
          {modes[0].displayName}
        </button>
      ) : (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            className={`btn btn-sm ${currentModeId ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setIsOpen(!isOpen)}
            style={{ gap: '6px' }}
          >
            <Layers size={16} />
            <span>{currentMode ? currentMode.displayName : 'Select Mode'}</span>
            <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>

          {isOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                minWidth: '220px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                padding: '6px',
                zIndex: 100,
                animation: 'fadeIn 0.15s ease'
              }}
            >
              <div style={{ padding: '6px 10px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                Available Modes
              </div>
              {modes.map(mode => {
                const isSelected = mode.id === currentModeId;
                return (
                  <button
                    key={mode.id}
                    onClick={() => {
                      onSelectMode(mode.id);
                      setIsOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '8px 12px',
                      background: isSelected ? 'var(--info-bg)' : 'transparent',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {mode.iconName === 'Brain' ? <Brain size={16} /> : <BookOpen size={16} />}
                      <span style={{ fontWeight: isSelected ? 600 : 400 }}>{mode.displayName}</span>
                    </div>
                    {isSelected && <Check size={16} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
