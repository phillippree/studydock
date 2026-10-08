export const CONNECTOR_CATEGORIES = [
  'addition',
  'contrast',
  'cause-effect',
  'sequence',
  'example',
  'conclusion',
  'condition',
  'comparison',
  'conjunction'
] as const;

export type ConnectorCategory = typeof CONNECTOR_CATEGORIES[number];
export type ConnectorVoice = 'active' | 'passive' | 'other';

export interface ConnectorExample {
  id: string;
  example: string;
  voice: ConnectorVoice;
  position: number;
}

export interface ConnectorEntry {
  id: string;
  connector: string;
  normalizedConnector: string;
  category: ConnectorCategory;
  language: string;
  meaning: string;
  examples: ConnectorExample[];
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorListQuery {
  category?: ConnectorCategory;
  search?: string;
  offset?: number;
  limit?: number;
}

export interface ConnectorListPage {
  entries: ConnectorEntry[];
  total: number;
}

export interface ConnectorLookupPreview {
  status: 'preview';
  token: string;
  connector: string;
  category: ConnectorCategory;
  language: string;
  meaning: string;
  examples: Array<{ example: string; voice: ConnectorVoice }>;
}

export type ConnectorLookupResult = ConnectorLookupPreview
  | { status: 'unrecognized'; connector: string; suggestions?: string[] }
  | { status: 'duplicate'; entry: ConnectorEntry };

export type ConnectorSaveResult = { status: 'saved' | 'duplicate'; entry: ConnectorEntry };
