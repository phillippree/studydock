export interface ModeDescriptor {
  id: string;
  displayName: string;
  description: string;
  iconName: string;
  order: number;
  comingSoon?: boolean;
}

export const IDIOMS_PHRASES_MODE: ModeDescriptor = {
  id: 'idioms-phrases',
  displayName: 'Idioms & Phrases',
  description: 'Look up expressions and build your local collection.',
  iconName: 'Quote',
  order: 3,
};

export const CONNECTORS_MODE: ModeDescriptor = {
  id: 'connectors',
  displayName: 'Connectors',
  description: 'Learn words and phrases that connect ideas and guide sentences.',
  iconName: 'Workflow',
  order: 4
};
