# Changelog

Notable StudyDock changes are recorded here. Entries are grouped by the app's release version and written for users; internal-only maintenance may be omitted.

## [Unreleased]

## [1.2.3] - 2026-10-06

### Added
- Local rotating logs for Gemini diagnostics and application startup errors, with API-key redaction.
- A script to push the current `main` commit and its matching version tag to GitHub.
- Idiom and phrase lookups now save six example sentences with active, passive, or other voice labels.
- Added a dedicated paginated Expression Library table with search and idiom/phrase filters.
- Added a per-expression action to generate and save six new voice-labeled example sentences.
- Expression names in the library now open a full detail card with the saved meaning and example sentences.
- Added a sentence refresh button to the expression detail card.

### Fixed
- The version hook now works with editor-based `git commit` and avoids incrementing an already-staged version twice.

## [1.2.2] - 2026-10-06

### Added
- Timestamped main-process logs saved under the app's local data folder, with size-based rotation and API-key redaction.

## [1.2.1] - 2026-10-06

### Added
- Word Quiz mode with a reveal-answer flow and access to the shared word library.
- Idioms & Phrases library with Gemini lookup, saved meanings and examples, filtering, pagination, and quiz practice.
- Vocabulary synonyms, multiple usage examples, pronunciation playback with local audio caching, and definition refresh actions.
- Gemini model discovery and connection testing, plus an update notice that links to the latest GitHub Release.
- macOS DMG packaging script and StudyDock app icon.

### Fixed
- Word lookup handles spelling suggestions and unrecognized terms more gracefully.
- Phrase lookup accepts nullable Gemini suggestions.
- Word Library additions and refresh actions work across Vocabulary and Word Quiz.

## [1.2.0] - 2026-10-06

### Added
- StudyDock desktop learning app with an offline word library, Gemini-powered definitions, and local SQLite storage.
- Gemini API key settings with encrypted local persistence and connection testing.
- Landing page for selecting learning modes and accessing settings.
