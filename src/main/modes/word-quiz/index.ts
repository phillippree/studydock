import { ipcMain } from 'electron';
import Database from 'better-sqlite3';
import { ModeDescriptor } from '../../../shared/contracts/modes';
import { WordQuizRepository } from './repository';

export const wordQuizModeDescriptor: ModeDescriptor = {
  id: 'word-quiz',
  displayName: 'Word Quiz',
  description: 'Recall a word’s meaning before revealing its saved definition.',
  iconName: 'Brain',
  order: 2
};

export function registerWordQuizMode(db: Database.Database): void {
  const repository = new WordQuizRepository(db);

  ipcMain.handle('wordQuiz:getRandomWord', (event, excludeWordId: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || typeof excludeWordId !== 'undefined' && (typeof excludeWordId !== 'string' || excludeWordId.length > 200)) {
      throw new Error('Invalid Word Quiz request');
    }
    return repository.getRandomWord(excludeWordId as string | undefined);
  });

  ipcMain.handle('wordQuiz:revealDefinition', (event, wordId: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || typeof wordId !== 'string' || wordId.length === 0 || wordId.length > 200) {
      throw new Error('Invalid Word Quiz word ID');
    }
    const definitions = repository.getDefinitions(wordId);
    if (!definitions.length) throw new Error('This word no longer has a saved definition.');
    return definitions;
  });
}
