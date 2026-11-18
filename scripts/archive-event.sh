#!/usr/bin/env bash
# archive-event.sh: the photo archive for a final tournament (decisions.md 2026-09-30 "Photo
# archive flow", 2026-10-01 three copies; architecture.md §4b; ops.md §9 "Close and finalize",
# §11 archive log; SPEC invariant 6). Run by Kayden, never by the app or the agent.
#
#   archive-event.sh copy   --pb-data DIR --archive DIR EVENT_ID
#       On the Proxmox host, after the post-finalize backup. Reads the tournament's photo list
#       from a read-only open of DIR/data.db, copies every photo of every catch in it (rejected
#       and retracted ones too) to DIR(archive)/EVENT_ID/photos/<catch>/<file>, and writes
#       MANIFEST.sha256. Stops, and leaves nothing behind, if a file is missing or any copy
#       still carries location metadata. Prints the manifest's own sha256.
#
#   archive-event.sh verify --archive DIR EVENT_ID
#       On the desktop (and the laptop), on the pulled copy: checks every file against the
#       manifest and prints the manifest's sha256 to compare with the one copy printed.
#
#   archive-event.sh remove --pb-data DIR --archive DIR --desktop-manifest SHA256 [--dry-run] EVENT_ID
#       On the host, once the desktop copy verified: refuses unless SHA256 (what verify printed
#       on the desktop) is the host copy's manifest hash, the host copy still verifies, and the
#       database still lists exactly the archived photos. Then deletes the originals and any
#       thumbnails from DIR/storage, outside the API: the records keep their filenames and the
#       app shows "Photo archived" (decisions.md 2026-10-03). Safe to run again.
#
# DIR(pb-data) is the container's pb_data as the host sees it (for example through `pct mount`);
# the container never reaches out to the host or the LAN. Needs sqlite3, exiftool and sha256sum.
#
# Exit codes: 0 done; 2 usage; 3 not a final tournament; 4 already archived; 5 location metadata
# found; 6 the desktop hash doesn't match; 7 the archive doesn't verify or doesn't match the
# database; 8 a photo file is missing; 9 a tool is missing.

set -euo pipefail
umask 022

ID_RE='^[a-z0-9]{15}$'
FILE_RE='^[A-Za-z0-9][A-Za-z0-9._-]*$'

die() {
  local code=$1
  shift
  printf 'archive-event: %s\n' "$*" >&2
  exit "$code"
}

usage() {
  sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

need() {
  for tool in "$@"; do
    command -v "$tool" >/dev/null 2>&1 || die 9 "$tool is not installed"
  done
}

command=${1:-}
[[ -n $command ]] || usage
shift

pb_data=""
archive=""
desktop_hash=""
dry_run=0
event=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --pb-data) pb_data=${2:-}; shift 2 ;;
    --archive) archive=${2:-}; shift 2 ;;
    --desktop-manifest) desktop_hash=${2:-}; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    -h | --help) usage ;;
    -*) die 2 "unknown option: $1" ;;
    *)
      [[ -z $event ]] || die 2 "one tournament at a time"
      event=$1
      shift
      ;;
  esac
done

[[ $event =~ $ID_RE ]] || die 2 "EVENT_ID must be a tournament id (15 lower-case letters and digits)"
[[ -n $archive ]] || die 2 "--archive is required"

dest="$archive/$event"

# sqlite3 on a read-only open of the database: the archive never writes to it.
query() {
  sqlite3 -readonly "$pb_data/data.db" "$1"
}

check_pb_data() {
  [[ -n $pb_data ]] || die 2 "--pb-data is required"
  [[ -f $pb_data/data.db ]] || die 2 "no data.db in $pb_data"
}

# The tournament must be final: its catches and entries can't change any more (invariant 7).
check_final() {
  local status
  status=$(query "select status from events where id = '$event';") || die 3 "couldn't read the events table"
  [[ -n $status ]] || die 3 "no tournament $event in this database"
  [[ $status == final ]] || die 3 "tournament $event is $status, not final"
}

# "<catch id> <file name>" for every photo of every catch in the tournament, sorted.
photo_list() {
  local rows line catch file
  rows=$(query "select c.id || ' ' || j.value from catches c join entries e on e.id = c.entry, json_each(c.photo) j where e.event = '$event' order by c.id, j.key;") ||
    die 7 "couldn't read the catches table"
  while IFS= read -r line; do
    [[ -n $line ]] || continue
    catch=${line%% *}
    file=${line#* }
    [[ $catch =~ $ID_RE && $file =~ $FILE_RE ]] || die 7 "unexpected photo entry: $line"
    printf '%s %s\n' "$catch" "$file"
  done <<<"$rows"
}

storage_dir() {
  local collection
  collection=$(query "select id from _collections where name = 'catches';") || die 7 "couldn't read the collections"
  [[ $collection =~ ^[A-Za-z0-9_]+$ ]] || die 7 "unexpected catches collection id: $collection"
  printf '%s/storage/%s\n' "$pb_data" "$collection"
}

# What a file still carries that can locate it: any GPS tag, in any group (EXIF, XMP, QuickTime),
# and any location-name tag. Empty means clean.
location_in() {
  exiftool -q -q -s -G1 -a '-gps*' '-*location*' '-*:city' '-*:country*' '-*:state' '-*:province*' "$1" 2>/dev/null || true
}

manifest_hash() {
  sha256sum "$1/MANIFEST.sha256" | cut -d' ' -f1
}

# Every file the manifest names matches, and nothing else is in the copy.
verify_copy() {
  local dir=$1 listed present
  [[ -f $dir/MANIFEST.sha256 ]] || die 7 "no MANIFEST.sha256 in $dir"
  (cd "$dir" && sha256sum --check --quiet --strict MANIFEST.sha256) >&2 || die 7 "$dir doesn't match its manifest"
  listed=$(wc -l <"$dir/MANIFEST.sha256")
  present=$(cd "$dir" && find . -type f ! -name MANIFEST.sha256 | wc -l)
  [[ $listed -eq $present ]] || die 7 "$dir has $present files but its manifest lists $listed"
}

cmd_copy() {
  need sqlite3 exiftool sha256sum
  check_pb_data
  check_final
  [[ ! -e $dest ]] || die 4 "$dest already exists: this tournament is already archived"
  mkdir -p "$archive"

  local storage list partial count=0 found=0 catch file leaks name
  storage=$(storage_dir)
  list=$(photo_list)
  partial="$archive/.$event.partial"
  rm -rf "$partial"
  # Whatever happens from here, a failed copy leaves nothing behind.
  trap 'rm -rf "$partial"' EXIT
  mkdir -p "$partial/photos"

  while read -r catch file; do
    [[ -n ${catch:-} ]] || continue
    [[ -f $storage/$catch/$file ]] || die 8 "photo missing from storage: $catch/$file"
    mkdir -p "$partial/photos/$catch"
    cp -p "$storage/$catch/$file" "$partial/photos/$catch/$file"
    count=$((count + 1))
  done <<<"$list"

  # Stop if any copy can still locate a fishing spot (decisions.md 2026-09-30; T4).
  while read -r catch file; do
    [[ -n ${catch:-} ]] || continue
    leaks=$(location_in "$partial/photos/$catch/$file")
    if [[ -n $leaks ]]; then
      printf 'location metadata in %s/%s:\n%s\n' "$catch" "$file" "$leaks" >&2
      found=$((found + 1))
    fi
  done <<<"$list"
  [[ $found -eq 0 ]] || die 5 "$found photo(s) carry location metadata; nothing was archived"

  name=$(query "select name from events where id = '$event';")
  {
    printf 'event %s\n' "$event"
    printf 'name %s\n' "$name"
    printf 'photos %s\n' "$count"
    printf 'copied %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"$partial/EVENT.txt"
  (cd "$partial" && find . -type f ! -name MANIFEST.sha256 -printf '%P\n' | LC_ALL=C sort | xargs -r -d '\n' sha256sum) >"$partial/MANIFEST.sha256"
  find "$partial" -type f -exec chmod 0444 {} +

  mv "$partial" "$dest"
  trap - EXIT
  printf 'Archived %s photos of "%s" to %s\n' "$count" "$name" "$dest"
  printf 'Manifest sha256: %s\n' "$(manifest_hash "$dest")"
  printf 'Next: the desktop pulls it and runs "archive-event.sh verify --archive <its copy> %s".\n' "$event"
}

cmd_verify() {
  need sha256sum
  verify_copy "$dest"
  printf 'Verified %s files.\n' "$(wc -l <"$dest/MANIFEST.sha256")"
  printf 'Manifest sha256: %s\n' "$(manifest_hash "$dest")"
}

cmd_remove() {
  need sqlite3 sha256sum
  check_pb_data
  [[ $desktop_hash =~ ^[0-9a-f]{64}$ ]] || die 2 "--desktop-manifest must be the 64-character sha256 that verify printed on the desktop"
  check_final
  verify_copy "$dest"
  [[ $(manifest_hash "$dest") == "$desktop_hash" ]] || die 6 "the desktop's manifest hash doesn't match this copy's; nothing removed"

  # The database must still list exactly the photos that were archived.
  local storage want have removed=0 gone=0 catch file
  storage=$(storage_dir)
  want=$(photo_list | while read -r catch file; do printf 'photos/%s/%s\n' "$catch" "$file"; done | LC_ALL=C sort)
  have=$(grep -v ' EVENT.txt$' "$dest/MANIFEST.sha256" | sed 's/^[0-9a-f]\{64\}  //' | LC_ALL=C sort)
  [[ $want == "$have" ]] || die 7 "the database's photo list and the archive differ; nothing removed"

  while read -r catch file; do
    [[ -n ${catch:-} ]] || continue
    if [[ -f $storage/$catch/$file ]]; then
      if [[ $dry_run -eq 1 ]]; then
        printf 'would remove %s/%s\n' "$catch" "$file"
      else
        rm -f "$storage/$catch/$file"
      fi
      removed=$((removed + 1))
    else
      gone=$((gone + 1))
    fi
    if [[ -d $storage/$catch/thumbs_$file ]]; then
      if [[ $dry_run -eq 1 ]]; then printf 'would remove %s/thumbs_%s/\n' "$catch" "$file"; else rm -rf "$storage/$catch/thumbs_$file"; fi
    fi
  done <<<"$(photo_list)"

  if [[ $dry_run -eq 1 ]]; then
    printf 'Dry run: %s photos would be removed (%s already gone). Nothing changed.\n' "$removed" "$gone"
  else
    printf 'Removed %s photos from the app (%s were already gone). The records are unchanged.\n' "$removed" "$gone"
    printf 'Log it in ops.md §11 (archive log).\n'
  fi
}

case $command in
  copy) cmd_copy ;;
  verify) cmd_verify ;;
  remove) cmd_remove ;;
  -h | --help | help) usage ;;
  *) die 2 "unknown command: $command (copy, verify or remove)" ;;
esac
