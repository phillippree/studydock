import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { connectionTestSchema } from './gemini/connectionTest';
import { storagePaths } from './storage/paths';
import { getDatabase, closeDatabase } from './database/connection';
import { MigrationRunner } from './database/migrations';
import { geminiClient } from './gemini/client';
import { settingsService } from './settings/service';
import { registerVocabMode, vocabModeDescriptor } from './modes/vocab';
import { registerWordQuizMode, wordQuizModeDescriptor } from './modes/word-quiz';
import { idiomsPhrasesModeDescriptor, registerIdiomsPhrasesMode } from './modes/idioms-phrases';
import { connectorsModeDescriptor, registerConnectorsMode } from './modes/connectors';
import { jokesModeDescriptor, registerJokesMode } from './modes/jokes';
import { ModeDescriptor } from '../shared/contracts/modes';
import { checkForUpdates } from './updates/checkForUpdates';
import { appLogger } from './logging/logger';

const LATEST_RELEASE_PAGE = 'https://github.com/phillippree/studydock/releases/latest';

// Set application identity
app.name = 'StudyDock';

let mainWindow: BrowserWindow | null = null;
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

const REGISTERED_MODES: ModeDescriptor[] = [
  vocabModeDescriptor,
  wordQuizModeDescriptor,
  idiomsPhrasesModeDescriptor,
  connectorsModeDescriptor,
  jokesModeDescriptor
];

async function createWindow(): Promise<BrowserWindow> {
  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 820,
    minHeight: 620,
    title: 'StudyDock',
    backgroundColor: '#f6f7f9',
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  // Display when ready to prevent visual flicker
  win.once('ready-to-show', () => {
    win.show();
  });

  // Security: Prevent arbitrary navigation to remote web pages
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.protocol !== 'file:' && !navigationUrl.startsWith('http://localhost:5173')) {
      event.preventDefault();
    }
  });

  if (isDev && !app.isPackaged) {
    try {
      await win.loadURL('http://localhost:5173');
    } catch {
      await win.loadFile(path.join(__dirname, '../renderer/index.html'));
    }
  } else {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}

function registerSettingsHandlers(): void {
  ipcMain.handle('updates:checkForUpdates', async (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
      throw new Error('Unauthorized update check');
    }
    return checkForUpdates(app.getVersion());
  });

  ipcMain.handle('updates:openLatestRelease', async (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
      throw new Error('Unauthorized update link');
    }
    await shell.openExternal(LATEST_RELEASE_PAGE);
    return { success: true };
  });

  ipcMain.handle('settings:getSettings', async () => {
    return settingsService.getSettings();
  });

  ipcMain.handle('settings:saveApiKey', async (_event, input) => {
    if (!input || typeof input.apiKey !== 'string') {
      throw new Error('Invalid API key input');
    }
    return settingsService.saveApiKey(input);
  });

  ipcMain.handle('settings:removeApiKey', async () => {
    return settingsService.removeApiKey();
  });

  ipcMain.handle('settings:testConnection', async (event, input: unknown) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
      throw new Error('Unauthorized connection test');
    }
    const request = connectionTestSchema.parse(input);
    return geminiClient.testConnection(request.model, request.apiKey);
  });

  ipcMain.handle('settings:listModels', async (event, input: unknown) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Unauthorized model discovery');
    const request = connectionTestSchema.pick({ apiKey: true }).parse(input);
    return geminiClient.listModels(request.apiKey);
  });

  ipcMain.handle('settings:setModel', async (_event, model) => {
    if (typeof model !== 'string' || !model.trim()) {
      throw new Error('Invalid model identifier');
    }
    return settingsService.setModel(model.trim());
  });

  ipcMain.handle('settings:openStorageFolder', async () => {
    return settingsService.openStorageFolder();
  });

  ipcMain.handle('modes:getModes', async () => {
    return REGISTERED_MODES.sort((a, b) => a.order - b.order);
  });
}

async function initializeApp(): Promise<void> {
  // Ensure application directories exist
  storagePaths.ensureDirectories();

  // Initialize SQLite database
  const db = getDatabase();

  // Register and run migrations for all modes
  const migrationRunner = new MigrationRunner(db);
  const vocabMode = registerVocabMode(db, geminiClient, settingsService);
  registerWordQuizMode(db);
  const idiomsPhrasesMode = registerIdiomsPhrasesMode(db, geminiClient, settingsService);
  const connectorsMode = registerConnectorsMode(db, geminiClient, settingsService);
  const jokesMode = registerJokesMode(db, geminiClient, settingsService);

  migrationRunner.runMigrations([
    ...vocabMode.migrations,
    ...idiomsPhrasesMode.migrations,
    ...connectorsMode.migrations,
    ...jokesMode.migrations
  ]);

  // Register settings & mode registry IPC handlers
  registerSettingsHandlers();

  // Create UI Window
  mainWindow = await createWindow();
}

app.whenReady().then(initializeApp).catch((error: unknown) => {
  appLogger.error(`Application startup failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = await createWindow();
  }
});

app.on('will-quit', () => {
  closeDatabase();
});
