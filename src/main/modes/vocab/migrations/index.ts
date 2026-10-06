import { Migration } from '../../../database/migrations';
import { migration001Initial } from './001_initial';
import { migration002DefinitionExamples } from './002_definition_examples';
import { migration003DefinitionSynonyms } from './003_definition_synonyms';

export const vocabMigrations: Migration[] = [
  migration001Initial,
  migration002DefinitionExamples,
  migration003DefinitionSynonyms
];
