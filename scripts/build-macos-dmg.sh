#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script creates a macOS disk image and must run on macOS." >&2
  exit 1
fi

if [[ ! -x "node_modules/.bin/electron-builder" ]]; then
  echo "Project dependencies are missing. Run 'npm ci' first." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI ('gh') is required to upload the disk image. Install it from https://cli.github.com/ and run 'gh auth login'." >&2
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid app version in package.json: $VERSION" >&2
  exit 1
fi

TAG="v$VERSION"
REPOSITORY="phillippree/studydock"
case "$(uname -m)" in
  arm64) ARCH="arm64" ;;
  x86_64) ARCH="x64" ;;
  *) echo "Unsupported macOS architecture: $(uname -m)" >&2; exit 1 ;;
esac
DMG_PATH="$PROJECT_ROOT/release/StudyDock-$VERSION-$ARCH.dmg"

if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run 'gh auth login' and try again." >&2
  exit 1
fi

if ! gh api "repos/$REPOSITORY/git/ref/tags/$TAG" >/dev/null 2>&1; then
  echo "GitHub tag '$TAG' was not found in $REPOSITORY." >&2
  echo "Push the matching version tag first, then run this script again." >&2
  exit 1
fi

npm run build
npx electron-builder --mac dmg

if [[ ! -f "$DMG_PATH" ]]; then
  echo "Expected disk image was not created: $DMG_PATH" >&2
  echo "Check the Electron Builder output and the files in $PROJECT_ROOT/release/." >&2
  exit 1
fi

if gh release view "$TAG" --repo "$REPOSITORY" >/dev/null 2>&1; then
  gh release upload "$TAG" "$DMG_PATH" --repo "$REPOSITORY"
else
  gh release create "$TAG" "$DMG_PATH" \
    --repo "$REPOSITORY" \
    --draft \
    --title "StudyDock $TAG" \
    --generate-notes \
    --verify-tag
fi

echo "StudyDock disk image created and attached to GitHub Release $TAG: $DMG_PATH"
echo "Review the release notes and publish the draft on GitHub when you're ready."
