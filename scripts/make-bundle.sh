#!/usr/bin/env bash
# Builds a release bundle on Kayden's machine, for `deploy.sh --bundle` while GitHub Actions can't
# run (interim; decisions.md 2026-11-17 draft). It packages exactly what ci.yml would (decisions.md
# L3): bundles/<sha>/bundle.tar.gz holding pb_public/ (built, with build.json), pb_hooks/,
# pb_migrations/, POCKETBASE_VERSION and BUILD_INFO, plus bundle.sha256.
#
# It refuses unless the tree is clean, the commit is on origin/main (the check the CI release job
# would make; deploy.sh can't make it for a local bundle) and Node is the .nvmrc major; then it
# runs `npm run check` with GITHUB_SHA set, so build.json carries the real commit.
#
# This is NOT a CI-tested build: it ran on this machine only.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

die() {
  echo "make-bundle: $*" >&2
  exit 1
}

want_node="$(tr -d '[:space:]' <.nvmrc)"
got_node="$(node --version 2>/dev/null || true)"
got_major="${got_node#v}"
got_major="${got_major%%.*}"
[ "$got_major" = "$want_node" ] || die "Node ${got_node:-not found}; .nvmrc says $want_node (run nvm use)"

[ -z "$(git status --porcelain)" ] || die "the working tree has uncommitted or untracked changes"
# Ignored files would be packaged too: none may sit in what goes into the bundle.
[ -z "$(git status --porcelain --ignored -- pb_hooks pb_migrations POCKETBASE_VERSION)" ] ||
  die "ignored files under pb_hooks/, pb_migrations/ or POCKETBASE_VERSION would be packaged"

git fetch --quiet origin main || die "git fetch origin main failed"
sha="$(git rev-parse HEAD)"
git merge-base --is-ancestor "$sha" origin/main || die "HEAD ($sha) is not on origin/main"

echo "make-bundle: npm run check for $sha"
GITHUB_SHA="$sha" npm run check

built="$(jq -r '.sha // empty' pb_public/build.json 2>/dev/null || true)"
[ "$built" = "$sha" ] || die "pb_public/build.json says '${built:-nothing}', not $sha"
[ -z "$(git status --porcelain)" ] || die "the check changed tracked files; not packaging"

mkdir -p bundles
out="$root/bundles/$sha"
stage="$(mktemp -d "$root/bundles/.stage.XXXXXX")"
trap 'rm -rf "$stage"' EXIT
cp -R pb_public pb_hooks pb_migrations POCKETBASE_VERSION "$stage/"
echo "$sha" >"$stage/BUILD_INFO"

rm -rf "$out"
mkdir "$out"
# COPYFILE_DISABLE stops macOS tar from adding ._ AppleDouble files.
COPYFILE_DISABLE=1 tar -C "$stage" -czf "$out/bundle.tar.gz" pb_public pb_hooks pb_migrations POCKETBASE_VERSION BUILD_INFO
hash="$(sha256sum "$out/bundle.tar.gz" | cut -d' ' -f1)"
echo "$hash  bundle.tar.gz" >"$out/bundle.sha256"

echo "make-bundle: bundles/$sha/bundle.tar.gz"
echo "make-bundle: sha256 $hash"
echo "make-bundle: deploy.sh prints the same sha256 on the container before it changes anything"
