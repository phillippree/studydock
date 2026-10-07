# StudyDock agent instructions

These instructions apply to this repository and its descendants. StudyDock (`studydock`) is a local desktop learning hub built with Electron, strict TypeScript, React, Vite, SQLite (`better-sqlite3`), and Gemini. Vocabulary is the first independent learning mode. Packaging uses Electron Builder, not Electron Forge.

## Getting started and commands

Use the scripts in `package.json` and the committed lockfile; verify installed APIs when changing dependencies.

- `npm ci`: install from the lockfile; use `npm install` when intentionally changing dependencies. The postinstall script prepares native Electron dependencies.
- `npm run dev`: compile main/preload and launch the development interface and Electron. Restart after main/preload changes unless a watcher has been added.
- `npm run typecheck`: strict TypeScript checks.
- `npm test`: run Vitest tests; `npm run test:watch` for iteration.
- `npm run build`: type check and build renderer, main, and preload.
- `npm start`: rebuild through `prestart`, then launch `dist/main/index.js`.
- `npm run package`: build and package into `release/` for the configured platform.

Do not claim packaging works on platforms that were not tested. Account for the different Node/Electron native ABIs when diagnosing SQLite failures; do not rebuild dependencies blindly.

## Git workflow

- When the user says “add to git,” stage the current project changes and create a commit with a concise, descriptive message.
- Review the staged diff before committing. Preserve unrelated changes and avoid staging secrets, generated output, dependencies, runtime data, or user files that are outside the requested work.
- Do not push, publish, or otherwise upload commits unless the user explicitly asks.

## TypeScript and code style

- Write application code in TypeScript and React interfaces in TSX. Compile to JavaScript before execution; do not add runtime TypeScript loaders.
- Keep strict compiler settings. Avoid `any`; use explicit contracts and narrow `unknown` at runtime boundaries.
- Follow surrounding formatting and existing imports. No formatter or lint script is currently configured; do not claim one ran or add a framework solely for cosmetic changes.
- Existing aliases are `@shared/`, `@main/`, `@renderer/`, and `@preload/`. Keep compiler, Vite, and test resolution consistent when using them.
- Use functional React components and hooks. Handle loading, empty, success, and error states explicitly.
- Edit source files, not generated `dist/` assets. Keep builds, releases, dependencies, runtime storage, and secrets out of Git.

## Process boundaries and security

- `src/renderer/`: interface and presentation state only.
- `src/preload/index.ts`: narrow named operations exposed through `window.studydockBridge`.
- `src/main/`: database, filesystem, settings, credentials, Gemini, and native operations.
- `src/shared/contracts/`: typed requests and results shared across processes.
- Keep context isolation and sandboxing enabled, renderer Node integration disabled, and a restrictive Content Security Policy.
- Do not reference Node globals such as `process`, `require`, or `__dirname` in renderer code. Expose needed nonsecret information through a typed bridge operation.
- Validate IPC senders and all incoming data in the main process; TypeScript types are not runtime validation.
- Do not expose generic IPC forwarding, arbitrary SQL, filesystem paths, or shell execution to the renderer.
- Render generated content as text. Do not execute generated markup or load remote pages into the app window.
- Keep expensive work off the UI thread and show actionable failures rather than a blank window. Protect the application shell and active mode with error boundaries.

## Independent learning modes

- Each mode has its own renderer entry point under `src/renderer/modes/<id>/` and backend registration under `src/main/modes/<id>/`.
- Each mode owns its state, screens, service, repository, prompts, validation, and migrations.
- Modes must not import another mode's internals. Shared services need stable, explicit contracts.
- Register modes through the shell registry and backend registration. Keep metadata consistent; generate landing cards and navigation from the registry rather than introducing more hardcoded lists.
- Lazy load interfaces. Adding a mode must not require editing established vocabulary implementation files.
- This is a registry of shipped modules, not arbitrary external plugin execution. Do not introduce external plugin loading without a user request.

## Application storage and SQLite

- Centralize runtime paths in `src/main/storage/paths.ts`.
- Persistent application data belongs under Electron's `app.getPath('userData')`, with a stable StudyDock identity across updates.
- Never silently fall back to the repository, working directory, installation directory, or `dist/`. If application storage cannot be resolved, surface the error. Tests may inject an isolated temporary root.
- Suggested layout: `database/studydock.sqlite`, `settings/preferences.json`, `secrets/gemini-key.enc`, `backups/`, and `storage/modes/<id>/`. Create directories as needed.
- Only the main process opens SQLite. Mode repositories own SQL; use parameterized queries, enabled foreign keys, and transactions for related changes.
- Keep SQLite WAL/journal files beside the database. Give modes separate table namespaces and tracked migrations.
- Preserve existing data during updates and migrations. Never delete or reset the user's database to resolve development problems.
- Report write failures accurately. Do not return success after swallowing settings, database, or secret-file errors.
- Imports/exports use user-selected locations. Exports and ordinary backups exclude credentials and encrypted secret files.

## API keys and privacy

- Users enter Gemini keys in application settings. Never hardcode real keys or save them in source, `.env`, project configuration, the repository, compiled assets, or test fixtures.
- Persist keys only after encrypting in the main process with supported Electron OS-backed secure storage. Confirm the storage backend is actually protective; do not accept an insecure plaintext fallback as secure encryption.
- If secure storage is unavailable, offer clearly indicated session-only use without writing the key to disk.
- After entry, expose only key-presence/masked status. Never return saved plaintext credentials to the renderer.
- Never include keys in logs, errors, screenshots, exports, or documentation. Use unmistakably fake values in tests.
- Removing or replacing credentials must handle disk errors and invalidate relevant memory/client state. Do not claim removal succeeded while persisted credentials remain.
- Saved words work offline. Explain that requesting new definitions sends the selected word and prompt to Gemini and may incur API usage.
- Minimize retained data and document storage and deletion behavior. Automated checks must not inspect or modify the user's real application data.

## Gemini and vocabulary behavior

- Keep Gemini access in the shared main-process client. Prefer the supported official `@google/genai` SDK; an older SDK is currently present and must not become a permanent requirement or cause silent duplicate requests.
- Verify SDK/model APIs before changes. Keep model configuration editable; do not assume a model stays available indefinitely.
- Keep vocabulary prompts and schemas inside the vocabulary mode. Request structured output and validate word identity, language, recognized status, and senses before saving.
- Treat supplied words as data. Handle unrecognized words without inventing successful definitions.
- Normalize words consistently and enforce uniqueness by normalized word and language. Save new words before fetching definitions.
- Reuse cached definitions. Refresh explicitly, and preserve previous definitions until replacement generation and persistence succeed.
- Deduplicate concurrent requests. Bound timeouts/retries; avoid automatic repeated paid requests after credential, quota, or validation failures.
- Ignore stale UI responses. Do not save stale results against deleted words or words whose identity changed.
- If saving a valid response fails, show it as unsaved and allow retrying persistence without another Gemini request.
- Seed starter words once. Do not recreate them after the user deletes them.

## Interface conventions

- Follow the approved StudyDock design: quiet desktop shell, readable system typography, restrained green accents, simple cards, and system light/dark appearance. Avoid decorative gradients and unrelated dashboard metrics.
- Landing page: mode cards and Gemini settings, with clear key and connection status and access to the application data folder.
- Vocabulary: prominent serif word, parts of speech, definitions/examples, saved/generated status, refresh, next random word, and word-library access.
- Preserve Home navigation and registry-driven mode selection. Do not ship fake selectable modes.
- Use the existing CSS variables in `src/renderer/styles/global.css` and `lucide-react` icons. Do not add shadcn, Tailwind, or another UI framework unless requested.
- Use semantic buttons, associated input labels, visible focus states, and keyboard-accessible controls. Keep controls out of draggable Electron regions and clear of macOS window controls.
- Retain working library and settings actions while changing layout. Verify contrast, alignment, scrolling, and window resizing in both appearances when possible.
- Keep ordinary product text understandable to a nontechnical user.

## Tests and verification

- Add or update focused regression tests for behavior changes and bug fixes. New functional features need meaningful tests; purely cosmetic changes need visual verification rather than tests mirroring CSS.
- Use Vitest under `tests/`, mocked Gemini responses, and isolated temporary storage/databases. No real credentials or paid API calls in automated tests.
- For code changes, run type checking, relevant tests, and the production build. Run the full existing suite when shared services or process boundaries change.
- For startup/UI changes, launch the compiled Electron app and inspect the landing screen and affected mode when UI tools are available. A running process or successful build alone does not prove rendering works.
- Check persistence with disposable test data, not the user's library. Verify failure paths when changing storage, secrets, or refresh behavior.
- Test packaging when packaging/native dependencies change and the environment supports it.
- Report exact results and any unavailable checks. Never state tests, visual inspection, live Gemini calls, or packaging passed if they were not performed.

## Documentation and communication

- Read relevant existing documentation before implementation. Update `README.md` for changes to setup, commands, architecture, storage, packaging, or mode registration.
- Update `CHANGELOG.md` for every user-facing bug fix or feature. Add a concise, user-focused bullet under `[Unreleased]` while working; keep internal-only refactors and maintenance out unless they change behavior users notice. When preparing a release, move those notes into the matching version section and date it.
- For substantial topics, use focused Markdown files under `documents/` if needed, with concise names such as `mode-guide.md` or `storage.md`; link them from the README.
- Before changing code, briefly explain findings or intended behavior, the concrete approach, and relevant verification. Keep progress updates concise.
- Work within the user's authorized scope. Ask before consequential actions such as deleting user data, publishing releases, or changing security-sensitive access. Do not require repeated confirmation for routine authorized fixes.
- Preserve unrelated local changes. Summarize what changed, why, verification results, and material limitations at completion.
