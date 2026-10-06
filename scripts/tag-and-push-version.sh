#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Run this script from inside a StudyDock Git repository." >&2
  exit 1
}
cd "$PROJECT_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to read package.json." >&2
  exit 1
fi

working_version="$(node -e 'process.stdout.write(require("./package.json").version ?? "")')"
if [[ ! "$working_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "package.json must contain a semantic major.minor.patch version; found '$working_version'." >&2
  exit 1
fi

branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  echo "Release tags must be created from main (currently on '$branch')." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "The working tree has staged or unstaged changes. Commit them before tagging." >&2
  git status --short
  exit 1
fi

if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "The repository has no commit to tag yet." >&2
  exit 1
fi

committed_version="$(git show HEAD:package.json | node -e 'let data=""; process.stdin.setEncoding("utf8"); process.stdin.on("data", chunk => data += chunk); process.stdin.on("end", () => process.stdout.write(JSON.parse(data).version ?? ""));')"
if [[ "$working_version" != "$committed_version" ]]; then
  echo "Working package.json version ($working_version) differs from the committed version ($committed_version)." >&2
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "No Git remote named origin is configured." >&2
  exit 1
fi

tag="v$working_version"
if git show-ref --verify --quiet "refs/tags/$tag"; then
  echo "Tag $tag already exists locally." >&2
  exit 1
fi

remote_tags="$(git ls-remote --tags origin "refs/tags/$tag" "refs/tags/$tag^{}")"
if [[ -n "$remote_tags" ]]; then
  echo "Tag $tag already exists on origin." >&2
  exit 1
fi

printf 'Push main to origin, create annotated tag %s for HEAD, and push that tag? [y/N] ' "$tag"
read -r confirmation
case "$confirmation" in
  y|Y|yes|YES|Yes) ;;
  *) echo "Cancelled; nothing was pushed and no tag was created."; exit 0 ;;
esac

git push origin main

git tag -a "$tag" -m "StudyDock $tag" HEAD
if git push origin "refs/tags/$tag"; then
  echo "Pushed main and created and pushed $tag. A GitHub Release was not published."
else
  echo "Push failed. Local tag $tag was created; after fixing the remote issue, retry with: git push origin refs/tags/$tag" >&2
  exit 1
fi
