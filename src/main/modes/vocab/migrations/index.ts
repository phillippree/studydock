import { Migration } from '../../../database/migrations';
import { migration001Initial } from './001_initial';
import { migration002DefinitionExamples } from './002_definition_examples';

export const vocabMigrations: Migration[] = [
  migration001Initial,
  migration002DefinitionExamples
];
