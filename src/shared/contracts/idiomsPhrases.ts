export type ExpressionType = 'idiom' | 'phrase';
export type ExampleVoice = 'active' | 'passive' | 'other';

export interface IdiomPhraseExample {
  id: string;
  example: string;
  voice: ExampleVoice;
  position: number;
}

export interface IdiomPhraseEntry {
  id: string;
  expression: string;
  normalizedExpression: string;
  type: ExpressionType;
  language: string;
  meaning: string;
  examples: IdiomPhraseExample[];
  createdAt: string;
  updatedAt: string;
}

export interface IdiomPhraseListQuery {
  type?: ExpressionType;
  search?: string;
  offset?: number;
  limit?: number;
}

export interface IdiomPhraseListPage {
  entries: IdiomPhraseEntry[];
  total: number;
}

export interface IdiomPhraseQuizPrompt {
  id: string;
  expression: string;
  type: ExpressionType;
  language: string;
}

export interface ExpressionLookupPreview {
  status: 'preview';
  token: string;
  expression: string;
  type: ExpressionType;
  language: string;
  meaning: string;
  examples: Array<{ example: string; voice: ExampleVoice }>;
}

export type LookupExpressionResult =
  | ExpressionLookupPreview
  | { status: 'duplicate'; entry: IdiomPhraseEntry }
  | { status: 'unrecognized'; expression: string; suggestion?: string };

export type SaveExpressionResult = { status: 'saved' | 'duplicate'; entry: IdiomPhraseEntry };
