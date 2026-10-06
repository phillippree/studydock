import { contextBridge, ipcRenderer } from 'electron';
import { StudyDockAPI } from '../shared/contracts/ipc';

const api: StudyDockAPI = {
  // Modes
  getModes: () => ipcRenderer.invoke('modes:getModes'),

  // Settings & Secrets
  getSettings: () => ipcRenderer.invoke('settings:getSettings'),
  saveApiKey: (input) => ipcRenderer.invoke('settings:saveApiKey', input),
  removeApiKey: () => ipcRenderer.invoke('settings:removeApiKey'),
  testConnection: (model) => ipcRenderer.invoke('settings:testConnection', model),
  setModel: (model) => ipcRenderer.invoke('settings:setModel', model),
  openStorageFolder: () => ipcRenderer.invoke('settings:openStorageFolder'),

  // Vocabulary Operations
  vocabGetRandomWord: (options) => ipcRenderer.invoke('vocab:getRandomWord', options),
  vocabFetchDefinition: (wordId, forceRefresh) => ipcRenderer.invoke('vocab:fetchDefinition', { wordId, forceRefresh }),
  vocabSaveDefinitionRetry: (wordId, senses) => ipcRenderer.invoke('vocab:saveDefinitionRetry', { wordId, senses }),
  vocabGetAllWords: () => ipcRenderer.invoke('vocab:getAllWords'),
  vocabGetWordDetails: (wordId) => ipcRenderer.invoke('vocab:getWordDetails', wordId),
  vocabAddWord: (input) => ipcRenderer.invoke('vocab:addWord', input),
  vocabEditWord: (input) => ipcRenderer.invoke('vocab:editWord', input),
  vocabDeleteWord: (wordId) => ipcRenderer.invoke('vocab:deleteWord', wordId),
  vocabAddDefinition: (input) => ipcRenderer.invoke('vocab:addDefinition', input),
  vocabEditDefinition: (input) => ipcRenderer.invoke('vocab:editDefinition', input),
  vocabDeleteDefinition: (definitionId) => ipcRenderer.invoke('vocab:deleteDefinition', definitionId),
  vocabImportWords: (content, language) => ipcRenderer.invoke('vocab:importWords', { content, language }),
  vocabExportData: () => ipcRenderer.invoke('vocab:exportData')
};

contextBridge.exposeInMainWorld('studydockBridge', api);
