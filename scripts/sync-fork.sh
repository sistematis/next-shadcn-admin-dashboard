#!/usr/bin/env bash
#
# Sync fork dengan upstream repo
# Usage: ./scripts/sync-fork.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Fetching upstream..."
git fetch upstream

echo "==> Current branch: $(git branch --show-current)"
echo "==> Upstream main: $(git log --oneline upstream/main -1)"
echo "==> Origin main:   $(git log --oneline origin/main -1)"

# Check if upstream has new commits
LOCAL=$(git rev-parse origin/main)
REMOTE=$(git rev-parse upstream/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "✅ Already in sync with upstream."
  exit 0
fi

echo "⚠️  Upstream has new commits. Merging..."
git merge upstream/main --no-edit

echo "==> Pushing to origin fork..."
git push origin main

echo "✅ Fork synced successfully."
echo ""
echo "Note: If there are merge conflicts, resolve them manually, then:"
echo "  git add . && git commit && git push origin main"
