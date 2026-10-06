export type ExpressionType = 'idiom' | 'phrase';

export interface IdiomPhraseExample {
  id: string;
  example: string;
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

export type LookupExpressionResult =
  | { status: 'saved'; entry: IdiomPhraseEntry }
  | { status: 'duplicate'; entry: IdiomPhraseEntry }
  | { status: 'unrecognized'; expression: string; suggestion?: string };
