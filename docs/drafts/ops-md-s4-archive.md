# Draft for ops.md: the photo archive (S4 step 10)

Kayden: `docs/ops.md` is yours to edit. These are the changes `scripts/archive-event.sh` needs
there. Install what you agree with, then delete this file.

## §1 Inventory: the Proxmox host row, Notes

Add: "Runs `archive-event.sh` (installed by hand as `/usr/local/sbin/archive-event`, never from
a bundle). Needs `sqlite3`, `exiftool` and `sha256sum` (`apt install sqlite3 libimage-exiftool-perl`)."

The desktop and laptop need only `bash` and `sha256sum` to run `archive-event.sh verify` on their
copy. Keep a copy of the script beside each archive.

## §9 Tournament runbook, "Close and finalize": replace the archive steps with

- [ ] Post-finalize backup (host and B2).
- [ ] On the host, with the container's `pb_data` visible (for example `pct mount 110`, then
      `/var/lib/lxc/110/rootfs/opt/scoreboard/pb_data`):
      `archive-event copy --pb-data <pb_data> --archive <archive root> <event id>`
      It copies every photo of the tournament (rejected and retracted catches too) with a
      `MANIFEST.sha256`, and stops with nothing left behind if a photo is missing or any copy
      still carries location data (exit 5: tell Kayden-the-developer, don't hand-edit). Note the
      **Manifest sha256** it prints. `pct unmount 110` when done.
- [ ] Desktop pulls the archive, then runs `archive-event.sh verify --archive <its copy> <event id>`.
      It must say "Verified" and print **the same Manifest sha256**.
- [ ] Back on the host:
      `archive-event remove --pb-data <pb_data> --archive <archive root> --desktop-manifest <the hash the desktop printed> --dry-run <event id>`,
      read the list, then the same without `--dry-run`. It refuses unless the desktop's hash is
      the host copy's, the host copy still verifies, and the database still lists exactly the
      archived photos. It deletes the originals and thumbnails from `pb_data/storage` only,
      outside the API; records and the audit log are untouched, and the app already shows
      "Photo archived". Running it again is safe.
- [ ] Log it in §11: date, event, file count, manifest sha256, host copy, desktop verified,
      removed from app.
- [ ] Laptop pulls and runs `verify` on its next time on the home LAN; tick it in §11.

## §11 Archive log

No change to the columns. "Manifest sha256" is the hash `copy` and `verify` print.

## Exit codes (for the printed copy)

0 done · 2 usage · 3 not a final tournament · 4 already archived · 5 location metadata found ·
6 desktop hash doesn't match · 7 archive doesn't verify or doesn't match the database ·
8 a photo file is missing · 9 a tool is missing.
