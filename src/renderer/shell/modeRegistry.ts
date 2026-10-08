import React from 'react';
import { CONNECTORS_MODE, IDIOMS_PHRASES_MODE, JOKES_MODE, ModeDescriptor } from '../../shared/contracts/modes';

export interface RegisteredMode {
  descriptor: ModeDescriptor;
  component: React.LazyExoticComponent<React.ComponentType<{ onNavigateHome: () => void }>> | null;
}

export const modeRegistry: Record<string, RegisteredMode> = {
  vocab: {
    descriptor: {
      id: 'vocab',
      displayName: 'Vocabulary',
      description: 'Explore words and build your local word library.',
      iconName: 'BookOpen',
      order: 1
    },
    component: React.lazy(() => import('../modes/vocab/VocabPage'))
  },
  'word-quiz': {
    descriptor: {
      id: 'word-quiz',
      displayName: 'Word Quiz',
      description: 'Recall a word’s meaning before revealing its saved definition.',
      iconName: 'Brain',
      order: 2
    },
    component: React.lazy(() => import('../modes/word-quiz'))
  },
  'idioms-phrases': {
    descriptor: IDIOMS_PHRASES_MODE,
    component: React.lazy(() => import('../modes/idioms-phrases'))
  },
  connectors: {
    descriptor: CONNECTORS_MODE,
    component: React.lazy(() => import('../modes/connectors'))
  },
  jokes: {
    descriptor: JOKES_MODE,
    component: React.lazy(() => import('../modes/jokes'))
  }
};

export function getAllRegisteredModes(): ModeDescriptor[] {
  return Object.values(modeRegistry)
    .map(m => m.descriptor)
    .sort((a, b) => a.order - b.order);
}

export function getAvailableModes(): ModeDescriptor[] {
  return getAllRegisteredModes().filter(mode => !mode.comingSoon);
}

export function getModeComponent(modeId: string) {
  const mode = modeRegistry[modeId];
  return mode && !mode.descriptor.comingSoon ? mode.component : null;
}
