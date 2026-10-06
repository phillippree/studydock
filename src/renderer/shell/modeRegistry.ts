import React from 'react';
import { ModeDescriptor } from '../../shared/contracts/modes';

export interface RegisteredMode {
  descriptor: ModeDescriptor;
  component: React.LazyExoticComponent<React.ComponentType<{ onNavigateHome: () => void }>>;
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
  }
};

export function getAllRegisteredModes(): ModeDescriptor[] {
  return Object.values(modeRegistry)
    .map(m => m.descriptor)
    .sort((a, b) => a.order - b.order);
}

export function getModeComponent(modeId: string) {
  return modeRegistry[modeId]?.component || null;
}
