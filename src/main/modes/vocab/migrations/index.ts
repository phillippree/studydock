import { Migration } from '../../../database/migrations';
import { migration001Initial } from './001_initial';

export const vocabMigrations: Migration[] = [
  migration001Initial
];
