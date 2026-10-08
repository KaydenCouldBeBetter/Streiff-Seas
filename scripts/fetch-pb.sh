#!/usr/bin/env bash
# Downloads the PocketBase release pinned in POCKETBASE_VERSION and unpacks the
# binary to ./pocketbase. Exits non-zero, leaving no binary behind, if the zip's
# sha256 doesn't match the pinned one. linux_amd64 only (decisions.md 2026-10-06).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pin_file="$root/POCKETBASE_VERSION"

version="$(sed -n 's/^POCKETBASE_VERSION=//p' "$pin_file")"
want_sha="$(sed -n 's/^POCKETBASE_SHA256_LINUX_AMD64=//p' "$pin_file")"

if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "fetch-pb: POCKETBASE_VERSION has no usable POCKETBASE_VERSION= line" >&2
  exit 1
fi
if [[ ! "$want_sha" =~ ^[0-9a-f]{64}$ ]]; then
  echo "fetch-pb: POCKETBASE_VERSION has no usable POCKETBASE_SHA256_LINUX_AMD64= line" >&2
  exit 1
fi

zip_name="pocketbase_${version}_linux_amd64.zip"
# PB_DOWNLOAD_BASE points this at another copy of the release (test/fetch-pb.test.ts uses a
# file:// one). Wherever the zip comes from, the pinned checksum still decides.
if [[ -n "${PB_DOWNLOAD_BASE:-}" ]]; then
  base="$PB_DOWNLOAD_BASE"
  proto='=https,file'
else
  base="https://github.com/pocketbase/pocketbase/releases/download"
  proto='=https'
fi
url="$base/v${version}/${zip_name}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "fetch-pb: downloading $url"
curl --fail --silent --show-error --location --proto "$proto" --output "$work/$zip_name" "$url"

got_sha="$(sha256sum "$work/$zip_name" | cut -d' ' -f1)"
if [[ "$got_sha" != "$want_sha" ]]; then
  echo "fetch-pb: sha256 mismatch for $zip_name" >&2
  echo "  pinned: $want_sha" >&2
  echo "  got:    $got_sha" >&2
  exit 1
fi

unzip -q -o "$work/$zip_name" pocketbase -d "$work"
chmod +x "$work/pocketbase"
mv -f "$work/pocketbase" "$root/pocketbase"

echo "fetch-pb: pocketbase v${version} ready (sha256 ok)"
