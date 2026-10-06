# StudyDock

**StudyDock** is an offline-first desktop personal learning hub built with **Electron**, **TypeScript**, **React**, **Vite**, **SQLite**, and the **Google Gemini SDK**.

The application features an extensible, modular architecture where independent learning modes can be plugged in without modifying existing mode implementation files. **Vocabulary** and **Word Quiz** use the same local word library. **Idioms & Phrases** is listed as a coming-soon placeholder.

---

## Architecture Overview

StudyDock enforces strict process isolation:

1. **Renderer Process (React & TSX):** UI components, mode navigation, and UI state. The renderer has zero direct access to Node.js, SQLite, the filesystem, or stored API keys.
2. **Preload Bridge:** A restricted, typed bridge exposing approved named operations to `window.studydockBridge`.
3. **Main Process (Electron & Node.js):** SQLite database access with transactions and migrations, OS-backed API key encryption, and shared Gemini client integration.

```mermaid
flowchart TB
    subgraph Renderer["Renderer · React"]
        Home["Landing page"]
        Registry["Mode registry"]
        Picker["Mode selector"]
        VocabUI["Vocabulary UI entry point"]
        FutureUI["Future mode UI entry points"]

        Home --> Registry
        Picker --> Registry
        Registry --> VocabUI
        Registry --> FutureUI
    end

    Renderer <-->|"Typed operations"| Preload["Restricted preload bridge"]
    Preload <-->|"Validated IPC requests and results"| Handlers["Main-process handlers"]

    subgraph Main["Electron main process"]
        Handlers --> VocabService["Vocabulary service"]
        Handlers --> FutureService["Future mode services"]
        Handlers --> Settings["Settings service"]

        VocabService --> VocabRepository["Vocabulary repository"]
        VocabRepository --> Database["Database connection"]

        VocabService --> GeminiClient["Shared Gemini client"]
        FutureService --> GeminiClient
        FutureService --> Database

        GeminiClient --> Secrets["API key service"]
        Settings --> Secrets
    end

    Database <--> SQLite[("Local SQLite database file")]
    Secrets <--> SecureStorage["OS-backed encrypted storage"]
    GeminiClient <-->|"Prompt and response"| Gemini["Gemini API"]
```

---

## Application Data & Storage Layout

All runtime application data is stored in Electron's per-user application data directory (`app.getPath('userData')`), completely outside source and compiled application trees.

```text
StudyDock application data/
  database/
    studydock.sqlite
  settings/
    preferences.json
  secrets/
    gemini-key.enc
  backups/
  storage/
    modes/
      vocab/
```

- **Database (`database/studydock.sqlite`):** Words, definitions, and migration history managed with SQLite WAL mode and foreign-key enforcement.
- **Settings (`settings/preferences.json`):** Application preferences such as the selected Gemini model (`gemini-2.5-flash`, `gemini-2.0-flash`, etc.).
- **Secrets (`secrets/gemini-key.enc`):** Gemini API key encrypted using Electron's OS-backed `safeStorage` (Keychain on macOS, DPAPI on Windows, Secret Service on Linux). If OS encryption is unavailable, keys are kept in session memory only and never written unencrypted to disk.

### Files created by Electron and Chromium

Electron also keeps a Chromium browser profile alongside StudyDock's application data. These entries support the embedded app window; they are not StudyDock's word database or Gemini settings. Chromium may recreate cache and journal entries as needed.

| Entry | Purpose |
|---|---|
| `Cache/` | Cached web resources used to render the app. |
| `Code Cache/` | Cached compiled browser scripts to help the interface load faster. |
| `GPUCache/`, `GPUPersistentCache/`, `DawnGraphiteCache/`, `DawnWebGPUCache/`, `GraphiteDawnCache/` | Graphics and GPU rendering caches. |
| `Cookies`, `Cookies-journal` | Chromium cookie store and its temporary database journal. |
| `DIPS`, `DIPS-wal` | Chromium site interaction and privacy state; the `-wal` entry is a SQLite write-ahead log. |
| `Local Storage/` | Browser-style local storage used by app web content. StudyDock's primary vocabulary data is stored in its SQLite database. |
| `Session Storage/` | Short-lived browser storage associated with app pages and sessions. |
| `Shared Dictionary/` | Cached compression dictionaries that Chromium can use for network resources. |
| `Trust Tokens`, `Trust Tokens-journal` | Chromium-managed trust-token data and its temporary journal. |
| `blob_storage/` | Browser-managed data backing temporary web blobs. |
| `Local State`, `Preferences` | Chromium and Electron profile settings. |
| `Network Persistent State` | Persistent state used by Chromium's network stack. |
| `declarative_performance_observer.db`, `declarative_performance_observer.db-journal` | Chromium performance-observation data and its temporary database journal. |
| `backups/` | Reserved for StudyDock database backups. |
| `storage/` | Reserved for persistent files owned by individual StudyDock modes. |

Files ending in `-wal` or `-journal` are database support files. Let the app and SQLite manage them; do not manually remove them while StudyDock is open. This README describes file purposes only and does not include a machine-specific storage location.

---

## Development & Build Commands

### Prerequisites
- **Node.js**: v20+ or v24+
- **npm**: v10+

### 1. Install Dependencies
```bash
npm install
```
*(Native SQLite dependencies for Electron will automatically be compiled via the postinstall script)*

### 2. Run in Development Mode
Compiles the main and preload scripts and starts Vite dev server with Electron:
```bash
npm run dev
```

### 3. Type Checking
Verifies full TypeScript typing across main, preload, renderer, shared contracts, and tests:
```bash
npm run typecheck
```

### 4. Run Automated Tests
Runs unit and integration tests using Vitest:
```bash
npm test
```

### 5. Production Build
Performs type checking, bundles the React interface with Vite, and compiles the Electron main and preload scripts:
```bash
npm run build
```

### 6. Start Compiled Production App
```bash
npm start
```

### 7. Package Desktop Application
Creates distributable installers (`.dmg`/`.zip` on macOS, `.exe` NSIS installer on Windows, `.AppImage` on Linux) in the `release/` directory:
```bash
npm run package
```

---

## How to Add a New Learning Mode

Adding a new independent learning mode (e.g. `Grammar`, `Flashcards`, or `Math`) requires 4 simple steps without editing any existing vocabulary files:

### Step 1: Define Mode Contracts & Migrations
Create `src/main/modes/<modeId>/migrations/001_initial.ts`:
```ts
import { Migration } from '../../../database/migrations';

export const modeInitialMigration: Migration = {
  id: '<modeId>_001_initial',
  name: 'Initial schema for <modeId>',
  modeId: '<modeId>',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS <modeId>_records (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }
};
```

### Step 2: Implement Main Process Service & Repository
Create `src/main/modes/<modeId>/service.ts` and `src/main/modes/<modeId>/index.ts` to register IPC handlers and export the mode descriptor:
```ts
import { ModeDescriptor } from '../../../shared/contracts/modes';

export const myModeDescriptor: ModeDescriptor = {
  id: 'mymode',
  displayName: 'My Mode',
  description: 'Practice and master new skills.',
  iconName: 'Sparkles',
  order: 2
};
```

### Step 3: Implement Renderer Component
Create `src/renderer/modes/<modeId>/MyModePage.tsx`:
```tsx
import React from 'react';

export const MyModePage: React.FC<{ onNavigateHome: () => void }> = ({ onNavigateHome }) => {
  return (
    <div className="card">
      <h1>My Learning Mode</h1>
      <button className="btn btn-secondary" onClick={onNavigateHome}>Back Home</button>
    </div>
  );
};
export default MyModePage;
```

### Step 4: Register in Mode Registry
Add the entry in `src/renderer/shell/modeRegistry.ts`:
```ts
import React from 'react';

modeRegistry['mymode'] = {
  descriptor: {
    id: 'mymode',
    displayName: 'My Mode',
    description: 'Practice and master new skills.',
    iconName: 'Sparkles',
    order: 2
  },
  component: React.lazy(() => import('../modes/mymode/MyModePage'))
};
```
The application shell, landing page cards, header navigation, and error boundary will automatically detect, list, and render your new mode.

### Word Quiz

Word Quiz selects randomly from vocabulary entries that already have one or more saved definitions. It sends only the word to the renderer at first. When the user chooses **Reveal definition**, the main process reads and returns its saved meanings. Hiding the answer clears it from the screen state; selecting another word resets the reveal state. The mode has its own renderer and main-process entry points, reads the existing vocabulary tables, adds no duplicate word data or migrations, and does not call Gemini.

---

## Manual Gemini Connection Verification

To verify live connectivity with the Google Gemini API:
1. Launch the application (`npm start` or `npm run dev`).
2. On the **Landing Page**, locate the **Gemini AI Connection** card.
3. Paste your Gemini API key (starts with `AIzaSy...`).
4. Click **Save Key** to persist it using OS-backed encryption.
5. Click **Test Connection**. StudyDock sends a minimal ping request and reports success along with the measured response latency.
6. Open **Vocabulary Mode** and click **Next random word** or add a custom word to query structured definitions in real time.

## Testing a Gemini key before saving

Paste a key into the Gemini settings field and click **Test Connection**. The entered key takes precedence over any saved key and is not persisted by testing. An empty field tests the saved key. Testing makes one small Gemini request, may incur API usage, and has a 15-second request timeout. Save Key remains a separate action.

## Gemini model selection

New installations default to `gemini-3.5-flash-lite`. Existing model preferences are preserved: if a legacy model fails, select a current model manually. **Refresh available models** queries Google using the entered key, or the saved key when the field is empty, without storing the entered key. The list filters for Gemini generateContent models suitable for text; listing does not guarantee generation access or structured-output support. Run **Test Connection** to verify generation access. Google restricts older 2.5 models for some projects. See https://ai.google.dev/gemini-api/docs/models.

## Compact Gemini settings

When a key is configured, the landing page initially shows a compact Gemini summary with the selected model and key storage status. **Edit settings** expands all existing controls; **Hide settings** collapses them. First-time setup and removing a saved key show the controls automatically. Key configured does not imply that a live connection test has succeeded.
