import { describe, expect, it } from 'vitest';
import { getAllRegisteredModes, getAvailableModes, getModeComponent } from '../../src/renderer/shell/modeRegistry';

describe('learning mode registry', () => {
  it('lists Idioms & Phrases as an available independent mode', () => {
    const mode = getAllRegisteredModes().find(mode => mode.id === 'idioms-phrases');

    expect(mode).toMatchObject({
      displayName: 'Idioms & Phrases',
      description: 'Look up expressions and build your local collection.'
    });
    expect(getAvailableModes().some(item => item.id === 'idioms-phrases')).toBe(true);
    expect(getModeComponent('idioms-phrases')).not.toBeNull();
  });

  it('keeps the implemented modes available', () => {
    expect(getAvailableModes().map(mode => mode.id)).toEqual(['vocab', 'word-quiz', 'idioms-phrases', 'connectors', 'jokes']);
    expect(getModeComponent('word-quiz')).not.toBeNull();
    expect(getModeComponent('connectors')).not.toBeNull();
    expect(getModeComponent('jokes')).not.toBeNull();
  });
});
