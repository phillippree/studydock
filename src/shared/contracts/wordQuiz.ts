import { VocabDefinition, VocabWord } from './vocab';

export interface WordQuizCard {
  word: VocabWord;
}

export interface WordQuizAnswer {
  definitions: VocabDefinition[];
}
