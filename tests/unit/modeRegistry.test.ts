import { describe, expect, it } from 'vitest';
import { getAllRegisteredModes, getAvailableModes, getModeComponent } from '../../src/renderer/shell/modeRegistry';

describe('learning mode registry', () => {
  it('lists Idioms & Phrases as coming soon without making it selectable', () => {
    const placeholder = getAllRegisteredModes().find(mode => mode.id === 'idioms-phrases');

    expect(placeholder).toMatchObject({
      displayName: 'Idioms & Phrases',
      comingSoon: true
    });
    expect(getAvailableModes().some(mode => mode.id === 'idioms-phrases')).toBe(false);
    expect(getModeComponent('idioms-phrases')).toBeNull();
  });

  it('keeps the implemented modes available', () => {
    expect(getAvailableModes().map(mode => mode.id)).toEqual(['vocab', 'word-quiz']);
    expect(getModeComponent('word-quiz')).not.toBeNull();
  });
});
