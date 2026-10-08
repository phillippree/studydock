export type JokeType = 'joke' | 'punchline';
export type JokeExampleVoice = 'active' | 'passive' | 'other';

export interface JokeExample {
  id: string;
  example: string;
  voice: JokeExampleVoice;
  position: number;
}

export interface JokeEntry {
  id: string;
  text: string;
  normalizedText: string;
  type: JokeType;
  language: string;
  explanation: string;
  examples: JokeExample[];
  createdAt: string;
  updatedAt: string;
}

export interface JokeListQuery {
  type?: JokeType;
  search?: string;
  offset?: number;
  limit?: number;
}

export interface JokeListPage {
  entries: JokeEntry[];
  total: number;
}

export interface JokeLookupPreview {
  status: 'preview';
  token: string;
  sourceText: string;
  text: string;
  type: JokeType;
  language: string;
  explanation: string;
  examples: Array<{ example: string; voice: JokeExampleVoice }>;
}

export type JokeLookupChoice = Omit<JokeLookupPreview, 'status'>;

export type JokeLookupResult = { status: 'choices'; text: string; type: JokeType; language: string; choices: JokeLookupChoice[] }
  | JokeLookupPreview
  | { status: 'unrecognized'; text: string; suggestion?: string }
  | { status: 'duplicate'; entry: JokeEntry };
export type JokeSaveResult = { status: 'saved' | 'duplicate'; entry: JokeEntry };
