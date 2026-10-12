import { ConnectorCategory } from './connectors';
import { ExpressionType } from './idiomsPhrases';
import { JokeType } from './jokes';

export interface LibraryTransferFile {
  format: 'studydock-library-list';
  version: 1;
  exportedAt: string;
  words: Array<{ text: string; language: string }>;
  expressions: Array<{ text: string; type: ExpressionType; language: string }>;
  connectors: Array<{ text: string; category: ConnectorCategory; language: string }>;
  jokes: Array<{ text: string; type: JokeType; language: string }>;
}

export interface LibraryTransferCounts {
  words: number;
  expressions: number;
  connectors: number;
  jokes: number;
}

export interface LibraryImportResult {
  imported: LibraryTransferCounts;
  skipped: LibraryTransferCounts;
}
