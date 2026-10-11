import { VocabDefinition, VocabRelatedForm, VocabWord } from './vocab';

export interface WordQuizCard {
  word: VocabWord;
}

export interface WordQuizAnswer {
  definitions: VocabDefinition[];
  relatedForms: VocabRelatedForm[];
}
