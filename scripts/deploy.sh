#!/usr/bin/env bash
# Deploys a release bundle to prod or staging (decisions.md L3; ops.md §5). Installed by hand on
# each container as /usr/local/sbin/scoreboard-deploy, never from a bundle, so a bundle can't
# replace its own deployer. Runs as root.
#
#   deploy.sh <tag> [--force]                prod: the bundle attached to the v* release <tag>
#   deploy.sh --staging                      staging: the newest green ci.yml build on main
#   deploy.sh --bundle <dir> [--staging] [--force]
#                                            either: a bundle built by scripts/make-bundle.sh
#                                            (interim while CI can't run; decisions.md 2026-11-17)
#
# Order: fetch and verify everything, and unpack and check it, while the old release still runs;
# then stop, back up pb_data, switch the `current` symlink, start and smoke-test through
# Cloudflare; switch back if the smoke test fails. On prod it refuses while /etc/scoreboard/FREEZE
# exists (unless --force), a tag whose commit isn't on main, and, while a tournament is live, a
# bundle that adds migrations or changes POCKETBASE_VERSION.
#
# Written for bash 3.2 too (the tests run on macOS): no mapfile, associative arrays or ${x,,}.
set -euo pipefail

# Every path can be moved by an environment variable, for test/deploy.test.ts. Only root can set
# the environment of a root process on the container, so this gives nobody anything new there.
ETC="${SCOREBOARD_ETC:-/etc/scoreboard}"
OPT="${SCOREBOARD_OPT:-/opt/scoreboard}"
BACKUPS="${SCOREBOARD_BACKUPS:-/var/backups/scoreboard}"
LOG_DIR="${SCOREBOARD_LOG_DIR:-/var/log/scoreboard}"
SERVICE="${SCOREBOARD_SERVICE:-scoreboard}"
SERVICE_USER="${SCOREBOARD_USER:-scoreboard}"
ENV_OWNER="${SCOREBOARD_ENV_OWNER:-0}"
GITHUB_API="${SCOREBOARD_GITHUB_API:-https://api.github.com}"
PB_DOWNLOAD_BASE="${SCOREBOARD_PB_DOWNLOAD_BASE:-https://github.com/pocketbase/pocketbase/releases/download}"
SMOKE_TRIES="${SCOREBOARD_SMOKE_TRIES:-30}"
SMOKE_WAIT="${SCOREBOARD_SMOKE_WAIT:-2}"

ENV_FILE="$ETC/deploy.env"
LOCK="$OPT/.deploy.lock"

say() { echo "deploy: $*"; }
die() {
  echo "deploy: $*" >&2
  exit 1
}

usage() {
  echo "usage: deploy.sh <tag> [--force] | --staging | --bundle <dir> [--staging] [--force]" >&2
  exit 2
}

# --- arguments ---------------------------------------------------------------------------------

tag=""
bundle_dir=""
staging=0
force=0
while [ $# -gt 0 ]; do
  case "$1" in
    --staging) staging=1 ;;
    --force) force=1 ;;
    --bundle)
      [ $# -ge 2 ] || usage
      bundle_dir="$2"
      shift
      ;;
    -*) usage ;;
    *)
      [ -z "$tag" ] || usage
      tag="$1"
      ;;
  esac
  shift
done

if [ -n "$bundle_dir" ]; then
  [ -z "$tag" ] || usage
  mode="bundle"
elif [ "$staging" = 1 ]; then
  [ -z "$tag" ] || usage
  mode="staging"
else
  [ -n "$tag" ] || usage
  mode="tag"
fi
if [ "$staging" = 1 ] && [ "$force" = 1 ]; then
  die "--force only overrides FREEZE, which staging never checks"
fi

TAG_RE='^v[0-9A-Za-z._-]+$'
SHA_RE='^[0-9a-f]{40}$'
HEX64_RE='^[0-9a-f]{64}$'
REPO_RE='^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
if [ "$mode" = tag ] && [[ ! "$tag" =~ $TAG_RE ]]; then
  die "'$tag' is not a v* tag"
fi

# --- state for the exit trap --------------------------------------------------------------------

work=""
have_lock=0
hc_pinged=0
HEALTHCHECKS_URL=""

ping_healthchecks() { # <suffix: "" or "/fail">
  [ "$staging" = 1 ] && [ -n "$HEALTHCHECKS_URL" ] || return 0
  hc_pinged=1
  curl -fsS --max-time 10 --retry 3 -o /dev/null "$HEALTHCHECKS_URL$1" || echo "deploy: Healthchecks ping failed" >&2
}

# shellcheck disable=SC2329 # called by the EXIT trap below
on_exit() {
  local status=$?
  if [ "$status" -ne 0 ] && [ "$hc_pinged" = 0 ]; then
    ping_healthchecks /fail
  fi
  if [ -n "$work" ]; then rm -rf "$work"; fi
  if [ "$have_lock" = 1 ]; then rm -rf "$LOCK"; fi
  exit "$status"
}
trap on_exit EXIT

# --- environment, secrets and lock --------------------------------------------------------------

[ -f "$ETC/ENVIRONMENT" ] || die "$ETC/ENVIRONMENT is missing"
environment="$(head -n 1 "$ETC/ENVIRONMENT" | tr -d '[:space:]')"
if [ "$staging" = 1 ]; then
  [ "$environment" = staging ] || die "--staging refused: $ETC/ENVIRONMENT says '$environment', not staging"
else
  [ "$environment" = prod ] || die "prod deploy refused: $ETC/ENVIRONMENT says '$environment', not prod"
fi

# deploy.env holds the tokens. It must be root's and 0600, and it is read as KEY=VALUE lines from
# a fixed list, never sourced, so nothing in it runs.
GITHUB_REPO=""
GITHUB_TOKEN=""
SMOKE_URL=""
CF_ACCESS_CLIENT_ID=""
CF_ACCESS_CLIENT_SECRET=""
[ -f "$ENV_FILE" ] || die "$ENV_FILE is missing"
if [ -z "$(find "$ENV_FILE" -maxdepth 0 -type f -user "$ENV_OWNER" -perm 600)" ]; then
  die "$ENV_FILE must be owned by root and mode 600"
fi
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in '' | '#'*) continue ;; esac
  key="${line%%=*}"
  value="${line#*=}"
  case "$key" in
    GITHUB_REPO | GITHUB_TOKEN | SMOKE_URL | CF_ACCESS_CLIENT_ID | CF_ACCESS_CLIENT_SECRET | HEALTHCHECKS_URL)
      printf -v "$key" '%s' "$value"
      ;;
    *) die "$ENV_FILE: unknown key '$key'" ;;
  esac
done <"$ENV_FILE"

require() { # <name>...
  local name
  for name in "$@"; do
    [ -n "${!name}" ] || die "$ENV_FILE has no $name"
  done
}
require SMOKE_URL CF_ACCESS_CLIENT_ID CF_ACCESS_CLIENT_SECRET
if [ "$mode" != bundle ]; then
  require GITHUB_REPO GITHUB_TOKEN
  [[ "$GITHUB_REPO" =~ $REPO_RE ]] || die "GITHUB_REPO must be owner/name"
fi
if [ "$staging" = 1 ]; then require HEALTHCHECKS_URL; fi
SMOKE_URL="${SMOKE_URL%/}"

mkdir -p "$OPT/releases" "$BACKUPS" "$LOG_DIR"
if ! mkdir "$LOCK" 2>/dev/null; then
  holder="$(cat "$LOCK/pid" 2>/dev/null || true)"
  if [ -n "$holder" ] && kill -0 "$holder" 2>/dev/null; then
    die "another deploy is running (pid $holder)"
  fi
  rm -rf "$LOCK"
  mkdir "$LOCK" || die "can't take the lock $LOCK"
fi
have_lock=1
echo "$$" >"$LOCK/pid"

work="$(mktemp -d "$OPT/.deploy.XXXXXX")"

# --- helpers ------------------------------------------------------------------------------------

# GitHub API calls. The token goes to curl as a header file, never in argv, and curl doesn't pass
# it on when GitHub redirects a download to another host.
github() { # <path> <output file> [accept]
  local accept="${3:-application/vnd.github+json}"
  curl -fsSL --proto '=https' --proto-redir '=https' --retry 3 --max-time 300 \
    -H @<(printf 'Authorization: Bearer %s\n' "$GITHUB_TOKEN") \
    -H "Accept: $accept" -H 'X-GitHub-Api-Version: 2022-11-28' \
    -o "$2" "$GITHUB_API/repos/$GITHUB_REPO$1"
}

# Refuses unless <sha> is on main: GitHub compares main...<sha>; "identical" or "behind" means
# main already contains it (decisions.md 2026-10-06).
require_on_main() { # <sha>
  local status
  github "/compare/main...$1" "$work/compare.json" || die "GitHub compare main...$1 failed"
  status="$(jq -r '.status // empty' "$work/compare.json")"
  case "$status" in
    identical | behind) say "commit $1 is on main ($status)" ;;
    *) die "commit $1 is not on main (compare says '${status:-nothing}'); refusing" ;;
  esac
}

current_target() { # prints releases/<id> or nothing
  if [ -L "$OPT/current" ]; then readlink "$OPT/current"; fi
}

build_info_of() { # <release dir>
  head -n 1 "$1/BUILD_INFO" 2>/dev/null | tr -d '[:space:]' || true
}

pin_value() { # <release dir> <key>
  sed -n "s/^$2=//p" "$1/POCKETBASE_VERSION" | head -n 1
}

# The smoke test, through Cloudflare with the Access service token: the health endpoint must say
# code 200 in its JSON (any unknown path answers 200 with index.html), and build.json must name
# the commit we expect. Retried while PocketBase starts.
smoke() { # <expected sha>
  local try=1 code
  while [ "$try" -le "$SMOKE_TRIES" ]; do
    code="$(curl -sS --max-time 10 -o "$work/health.json" -w '%{http_code}' \
      -H @<(printf 'CF-Access-Client-Id: %s\nCF-Access-Client-Secret: %s\n' "$CF_ACCESS_CLIENT_ID" "$CF_ACCESS_CLIENT_SECRET") \
      "$SMOKE_URL/api/health" 2>/dev/null || true)"
    if [ "$code" = 200 ] && jq -e '.code == 200' "$work/health.json" >/dev/null 2>&1; then
      code="$(curl -sS --max-time 10 -o "$work/build.json" -w '%{http_code}' \
        -H @<(printf 'CF-Access-Client-Id: %s\nCF-Access-Client-Secret: %s\n' "$CF_ACCESS_CLIENT_ID" "$CF_ACCESS_CLIENT_SECRET") \
        "$SMOKE_URL/build.json" 2>/dev/null || true)"
      if [ "$code" = 200 ] && [ "$(jq -r '.sha // empty' "$work/build.json" 2>/dev/null)" = "$1" ]; then
        return 0
      fi
    fi
    try=$((try + 1))
    if [ "$try" -le "$SMOKE_TRIES" ]; then sleep "$SMOKE_WAIT"; fi
  done
  return 1
}

log_line() { # <id> <pb version> <backup name> <result>
  local forced=no
  if [ "$force" = 1 ]; then forced="yes (--force)"; fi
  # The columns of ops.md §13, ready to paste.
  printf '| %s | %s | %s | %s | %s | %s |\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "$3" "$4" "$forced" \
    >>"$LOG_DIR/deploy.log"
}

# --- 1. FREEZE (prod only) ---------------------------------------------------------------------

if [ "$staging" = 0 ] && [ -e "$ETC/FREEZE" ]; then
  if [ "$force" = 1 ]; then
    say "FREEZE is set; going ahead because of --force (log it in ops.md §12)"
  else
    die "refused: $ETC/FREEZE exists (hard freeze, ops.md §6); only an event-blocking fix goes out, with --force"
  fi
fi

# --- 2. fetch the bundle ------------------------------------------------------------------------

expected_sha=""
case "$mode" in
  tag)
    if [ "$(current_target)" = "releases/$tag" ]; then
      say "$tag is already running; nothing to do"
      exit 0
    fi
    github "/commits/$tag" "$work/commit.json" || die "GitHub has no commit for $tag"
    expected_sha="$(jq -r '.sha // empty' "$work/commit.json")"
    [[ "$expected_sha" =~ $SHA_RE ]] || die "GitHub gave no commit sha for $tag"
    require_on_main "$expected_sha"
    github "/releases/tags/$tag" "$work/release.json" || die "no GitHub release for $tag"
    for name in bundle.tar.gz bundle.sha256; do
      ids="$(jq -r --arg n "$name" '[.assets[] | select(.name == $n) | .id] | if length == 1 then .[0] else empty end' "$work/release.json")"
      [ -n "$ids" ] || die "release $tag must have exactly one $name"
      github "/releases/assets/$ids" "$work/$name" application/octet-stream || die "downloading $name failed"
    done
    ;;
  staging)
    github "/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&per_page=1" "$work/runs.json" ||
      die "GitHub workflow runs request failed"
    run_id="$(jq -r '.workflow_runs[0].id // empty' "$work/runs.json")"
    expected_sha="$(jq -r '.workflow_runs[0].head_sha // empty' "$work/runs.json")"
    [ -n "$run_id" ] && [[ "$expected_sha" =~ $SHA_RE ]] || die "no successful ci.yml run on main"
    running="$(current_target)"
    if [ -n "$running" ] && [ "$(build_info_of "$OPT/$running")" = "$expected_sha" ]; then
      say "$expected_sha is already running; nothing to do"
      ping_healthchecks ""
      exit 0
    fi
    require_on_main "$expected_sha"
    github "/actions/runs/$run_id/artifacts?name=bundle-$expected_sha" "$work/artifacts.json" ||
      die "GitHub artifacts request failed"
    url="$(jq -r '[.artifacts[] | select(.expired == false)][0].archive_download_url // empty' "$work/artifacts.json")"
    [ -n "$url" ] || die "run $run_id has no unexpired artifact bundle-$expected_sha"
    # Only ever send the token to this repo's API URL.
    case "$url" in
      "$GITHUB_API/repos/$GITHUB_REPO/actions/artifacts/"*) ;;
      *) die "unexpected artifact download URL: $url" ;;
    esac
    github "${url#"$GITHUB_API/repos/$GITHUB_REPO"}" "$work/artifact.zip" || die "downloading the artifact failed"
    unzip -q -o "$work/artifact.zip" bundle.tar.gz bundle.sha256 -d "$work" || die "the artifact has no bundle"
    ;;
  bundle)
    [ -f "$bundle_dir/bundle.tar.gz" ] && [ -f "$bundle_dir/bundle.sha256" ] ||
      die "$bundle_dir must hold bundle.tar.gz and bundle.sha256"
    cp "$bundle_dir/bundle.tar.gz" "$bundle_dir/bundle.sha256" "$work/"
    say "WARNING: a locally built bundle; its on-main check was made only when it was built (make-bundle.sh)"
    ;;
esac

# --- 3. verify and unpack -----------------------------------------------------------------------

want_hash="$(cut -d' ' -f1 "$work/bundle.sha256" | head -n 1)"
[[ "$want_hash" =~ $HEX64_RE ]] || die "bundle.sha256 holds no sha256"
got_hash="$(sha256sum "$work/bundle.tar.gz" | cut -d' ' -f1)"
[ "$got_hash" = "$want_hash" ] || die "bundle sha256 mismatch (want $want_hash, got $got_hash)"
say "bundle sha256 $got_hash ok"

# Only the five bundle names, nothing that climbs out, and only files and directories.
tar -tzf "$work/bundle.tar.gz" >"$work/names" || die "bundle.tar.gz isn't a readable tar.gz"
while IFS= read -r name; do
  case "$name" in
    /* | .. | ../* | */.. | */../*) die "bundle entry '$name' leaves the release directory" ;;
    pb_public | pb_public/* | pb_hooks | pb_hooks/* | pb_migrations | pb_migrations/*) ;;
    POCKETBASE_VERSION | BUILD_INFO) ;;
    *) die "unexpected bundle entry '$name'" ;;
  esac
done <"$work/names"
tar -tvzf "$work/bundle.tar.gz" >"$work/listing"
while IFS= read -r entry; do
  case "$entry" in
    -* | d*) ;;
    *) die "bundle entry is not a plain file or directory: $entry" ;;
  esac
done <"$work/listing"

new="$work/release"
mkdir "$new"
tar -xzf "$work/bundle.tar.gz" -C "$new" --no-same-owner
chmod -R u=rwX,go=rX "$new"
for need in BUILD_INFO POCKETBASE_VERSION pb_public/build.json pb_hooks pb_migrations; do
  [ -e "$new/$need" ] || die "bundle has no $need"
done

build_sha="$(build_info_of "$new")"
[[ "$build_sha" =~ $SHA_RE ]] || die "BUILD_INFO holds no commit sha"
if [ -n "$expected_sha" ] && [ "$build_sha" != "$expected_sha" ]; then
  die "BUILD_INFO says $build_sha, expected $expected_sha"
fi
app_sha="$(jq -r '.sha // empty' "$new/pb_public/build.json" 2>/dev/null || true)"
[ "$app_sha" = "$build_sha" ] || die "pb_public/build.json says '${app_sha:-nothing}', BUILD_INFO says $build_sha"
say "bundle is commit $build_sha"

case "$mode" in
  tag) id="$tag" ;;
  *) id="$build_sha" ;;
esac
previous="$(current_target)"
if [ "$previous" = "releases/$id" ]; then
  say "$id is already running; nothing to do"
  ping_healthchecks ""
  exit 0
fi

# --- 4. no migrations or PocketBase change while a tournament is live (prod only) ---------------

if [ "$staging" = 0 ]; then
  schema_change=""
  if [ -z "$previous" ]; then
    schema_change="no release is running yet"
  else
    for file in "$new"/pb_migrations/*.js; do
      [ -e "$file" ] || continue
      if [ ! -e "$OPT/$previous/pb_migrations/$(basename "$file")" ]; then
        schema_change="it adds migration $(basename "$file")"
        break
      fi
    done
    if [ -z "$schema_change" ] && ! cmp -s "$new/POCKETBASE_VERSION" "$OPT/$previous/POCKETBASE_VERSION"; then
      schema_change="it changes POCKETBASE_VERSION"
    fi
  fi
  if [ -n "$schema_change" ] && [ -e "$OPT/pb_data/data.db" ]; then
    live="$(sqlite3 -readonly "$OPT/pb_data/data.db" "select count(*) from events where status = 'live';" 2>/dev/null)" ||
      die "refused: $schema_change, and the events table can't be read to rule out a live tournament"
    [[ "$live" =~ ^[0-9]+$ ]] || die "refused: $schema_change, and the live-tournament count is unreadable"
    if [ "$live" -gt 0 ]; then
      die "refused: a tournament is live and $schema_change (change control, ops.md §6)"
    fi
  fi
fi

# --- 5. the pinned PocketBase binary ------------------------------------------------------------

pb_version="$(pin_value "$new" POCKETBASE_VERSION)"
pb_sha="$(pin_value "$new" POCKETBASE_SHA256_LINUX_AMD64)"
[[ "$pb_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "POCKETBASE_VERSION has no usable version"
[[ "$pb_sha" =~ $HEX64_RE ]] || die "POCKETBASE_VERSION has no usable sha256"
zip_name="pocketbase_${pb_version}_linux_amd64.zip"
cache="$OPT/pb-cache/$pb_version"
mkdir -p "$cache"
if [ -f "$cache/$zip_name" ] && [ "$(sha256sum "$cache/$zip_name" | cut -d' ' -f1)" != "$pb_sha" ]; then
  say "cached $zip_name doesn't match the pin; fetching it again"
  rm -f "$cache/$zip_name"
fi
if [ ! -f "$cache/$zip_name" ]; then
  curl -fsSL --proto '=https' --proto-redir '=https' --retry 3 --max-time 300 \
    -o "$work/$zip_name" "$PB_DOWNLOAD_BASE/v$pb_version/$zip_name" || die "downloading $zip_name failed"
  got_hash="$(sha256sum "$work/$zip_name" | cut -d' ' -f1)"
  [ "$got_hash" = "$pb_sha" ] || die "$zip_name sha256 mismatch (pinned $pb_sha, got $got_hash)"
  mv "$work/$zip_name" "$cache/$zip_name"
fi
unzip -q -o "$cache/$zip_name" pocketbase -d "$new" || die "$zip_name has no pocketbase binary"
chmod 755 "$new/pocketbase"
reported="$("$new/pocketbase" --version 2>/dev/null || true)"
[ "$reported" = "pocketbase version $pb_version" ] ||
  die "the unpacked binary reports '$reported', not pocketbase version $pb_version"
say "PocketBase $pb_version verified"

rm -rf "${OPT:?}/releases/$id"
mv "$new" "$OPT/releases/$id"

# --- 6. back up: stop, copy (decisions.md 2026-10-07) -------------------------------------------

if [ ! -d "$OPT/pb_data" ]; then
  mkdir "$OPT/pb_data"
  chown "$SERVICE_USER:" "$OPT/pb_data"
fi
backup_name="pre-deploy-$id-$(date -u +%Y%m%dT%H%M%SZ).tar.zst"
say "stopping $SERVICE and backing up pb_data to $BACKUPS/$backup_name"
systemctl stop "$SERVICE"
if ! tar -C "$OPT" -cf - pb_data | zstd -q -o "$BACKUPS/$backup_name"; then
  rm -f "$BACKUPS/$backup_name"
  if [ -n "$previous" ]; then systemctl start "$SERVICE" || true; fi
  die "backup failed; the previous release was started again and nothing changed"
fi

# --- 7. switch and start ------------------------------------------------------------------------

ln -sfn "releases/$id" "$OPT/current"
say "current -> releases/$id; starting $SERVICE"

# --- 8. smoke test, and switch back if it fails -------------------------------------------------

if systemctl start "$SERVICE" && smoke "$build_sha"; then
  say "smoke test passed: $SMOKE_URL runs $build_sha"
  log_line "$id" "$pb_version" "$backup_name" ok
  for old in "$BACKUPS"/pre-deploy-*.tar.zst; do
    [ -e "$old" ] && [ "$old" != "$BACKUPS/$backup_name" ] || continue
    rm -f "$old"
  done
  ping_healthchecks ""
  say "done: $id"
  exit 0
fi

echo "deploy: smoke test FAILED for $id" >&2
systemctl stop "$SERVICE" || true
if [ -z "$previous" ]; then
  log_line "$id" "$pb_version" "$backup_name" "failed, nothing to roll back to"
  die "no previous release to switch back to; $SERVICE is stopped. Backup: $BACKUPS/$backup_name"
fi
ln -sfn "$previous" "$OPT/current"
result="failed, rolled back to ${previous#releases/}"
if systemctl start "$SERVICE" && smoke "$(build_info_of "$OPT/$previous")"; then
  result="$result (smoke ok)"
else
  result="$result (its smoke test failed too)"
fi
log_line "$id" "$pb_version" "$backup_name" "$result"
echo "deploy: $result" >&2
echo "deploy: if $id ran a migration that changed data, restore $BACKUPS/$backup_name (ops.md §5)" >&2
exit 1
