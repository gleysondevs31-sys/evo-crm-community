#!/usr/bin/env bash
set -euo pipefail

# Convert all configured git submodules into regular, vendored directories.
#
# This script must be run only after the submodules have been successfully
# initialized and contain their real source files. It intentionally refuses to
# run when any submodule directory is empty, because committing empty folders
# would lose the service source code.

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

fail() {
  echo "[ERROR] $*" >&2
  exit 1
}

info() {
  echo "[INFO] $*"
}

if [ ! -f .gitmodules ]; then
  fail ".gitmodules was not found. There are no configured submodules to vendor."
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  fail "Working tree has uncommitted changes. Commit or stash them before vendoring submodules."
fi

mapfile -t SUBMODULE_PATHS < <(git config --file .gitmodules --get-regexp '^submodule\..*\.path$' | awk '{print $2}')

if [ "${#SUBMODULE_PATHS[@]}" -eq 0 ]; then
  fail "No submodule paths found in .gitmodules."
fi

info "Validating submodule working trees..."
for path in "${SUBMODULE_PATHS[@]}"; do
  if [ ! -d "$path" ]; then
    fail "Submodule path '$path' does not exist. Run: git submodule update --init --recursive"
  fi

  if ! find "$path" -mindepth 1 -maxdepth 1 | read -r _; then
    fail "Submodule path '$path' is empty. Run: git submodule update --init --recursive"
  fi

  if [ ! -e "$path/.git" ]; then
    fail "Submodule path '$path' does not look initialized as a git checkout. Refusing to vendor incomplete content."
  fi
done

info "Removing submodule gitlinks from the index while keeping files on disk..."
for path in "${SUBMODULE_PATHS[@]}"; do
  git rm --cached -f "$path"
done

info "Removing nested git metadata so directories become normal source folders..."
for path in "${SUBMODULE_PATHS[@]}"; do
  find "$path" -name .git -prune -exec rm -rf {} +
done

info "Cleaning local submodule config sections..."
for path in "${SUBMODULE_PATHS[@]}"; do
  key="$(git config --file .gitmodules --get-regexp '^submodule\..*\.path$' | awk -v p="$path" '$2 == p {print $1}' || true)"
  name="$(printf '%s' "$key" | sed -E 's/^submodule\.//; s/\.path$//')"
  if [ -n "$name" ]; then
    git config --remove-section "submodule.$name" 2>/dev/null || true
  fi
  rm -rf ".git/modules/$path"
done

info "Removing .gitmodules because submodules are now vendored..."
git rm -f .gitmodules

info "Adding vendored service directories to the main repository index..."
for path in "${SUBMODULE_PATHS[@]}"; do
  git add "$path"
done

git add -u

cat <<'MSG'

[OK] Submodules were converted into normal vendored directories.

Review the staged diff carefully, then commit it:

  git status --short
  git commit -m "chore: vendor service submodules"

After this commit, future clones will receive the service code directly from
this repository and will not need `git submodule update --init --recursive`.
MSG
