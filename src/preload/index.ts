import { contextBridge, ipcRenderer } from 'electron';
import { StudyDockAPI } from '../shared/contracts/ipc';

const api: StudyDockAPI = {
  // Application updates
  checkForUpdates: () => ipcRenderer.invoke('updates:checkForUpdates'),
  openLatestRelease: () => ipcRenderer.invoke('updates:openLatestRelease'),

  // Modes
  getModes: () => ipcRenderer.invoke('modes:getModes'),

  // Settings & Secrets
  getSettings: () => ipcRenderer.invoke('settings:getSettings'),
  saveApiKey: (input) => ipcRenderer.invoke('settings:saveApiKey', input),
  removeApiKey: () => ipcRenderer.invoke('settings:removeApiKey'),
  testConnection: (model, apiKey) => ipcRenderer.invoke('settings:testConnection', { model, apiKey }),
  listModels: (apiKey) => ipcRenderer.invoke('settings:listModels', { apiKey }),
  setModel: (model) => ipcRenderer.invoke('settings:setModel', model),
  openStorageFolder: () => ipcRenderer.invoke('settings:openStorageFolder'),

  // Vocabulary Operations
  vocabGetRandomWord: (options) => ipcRenderer.invoke('vocab:getRandomWord', options),
  vocabFetchDefinition: (wordId, forceRefresh) => ipcRenderer.invoke('vocab:fetchDefinition', { wordId, forceRefresh }),
  vocabSaveDefinitionRetry: (wordId, senses) => ipcRenderer.invoke('vocab:saveDefinitionRetry', { wordId, senses }),
  vocabGetAllWords: () => ipcRenderer.invoke('vocab:getAllWords'),
  vocabGetWordDetails: (wordId) => ipcRenderer.invoke('vocab:getWordDetails', wordId),
  vocabAddWord: (input) => ipcRenderer.invoke('vocab:addWord', input),
  vocabVerifyAndAddWord: (input) => ipcRenderer.invoke('vocab:verifyAndAddWord', input),
  vocabEditWord: (input) => ipcRenderer.invoke('vocab:editWord', input),
  vocabDeleteWord: (wordId) => ipcRenderer.invoke('vocab:deleteWord', wordId),
  vocabAddDefinition: (input) => ipcRenderer.invoke('vocab:addDefinition', input),
  vocabEditDefinition: (input) => ipcRenderer.invoke('vocab:editDefinition', input),
  vocabDeleteDefinition: (definitionId) => ipcRenderer.invoke('vocab:deleteDefinition', definitionId),
  vocabImportWords: (content, language) => ipcRenderer.invoke('vocab:importWords', { content, language }),
  vocabExportData: () => ipcRenderer.invoke('vocab:exportData'),
  vocabGetPronunciation: (wordId) => ipcRenderer.invoke('vocab:getPronunciation', wordId),

  // Word Quiz Mode
  wordQuizGetRandomWord: (excludeWordId) => ipcRenderer.invoke('wordQuiz:getRandomWord', excludeWordId),
  wordQuizGetWord: (wordId) => ipcRenderer.invoke('wordQuiz:getWord', wordId),
  wordQuizRevealDefinition: (wordId) => ipcRenderer.invoke('wordQuiz:revealDefinition', wordId),
  // Idioms & Phrases Mode
  idiomsPhrasesList: (query) => ipcRenderer.invoke('idiomsPhrases:list', query),
  idiomsPhrasesLookupAndSave: (input) => ipcRenderer.invoke('idiomsPhrases:lookupAndSave', input),
  idiomsPhrasesRefreshExamples: (id) => ipcRenderer.invoke('idiomsPhrases:refreshExamples', id),
  idiomsPhrasesQuizGetRandom: (type, excludeId) => ipcRenderer.invoke('idiomsPhrases:quizGetRandom', { type, excludeId }),
  idiomsPhrasesQuizReveal: (id) => ipcRenderer.invoke('idiomsPhrases:quizReveal', id)
};

contextBridge.exposeInMainWorld('studydockBridge', api);
