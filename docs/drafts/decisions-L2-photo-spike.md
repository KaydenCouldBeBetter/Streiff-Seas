# Draft: decisions.md result of the photo spike (M0-04)

For Kayden to review and commit. Claude did not edit `decisions.md` or `security.md`.
Evidence: `docs/evidence/m0-04-photo.txt` (raw output). Tests: `test/upload.test.ts`, `test/spike/mechanics.test.ts`,
`test/spike/exifProbe.test.ts`. Fixtures: `scripts/make-photo-fixtures.py`. Binary: PocketBase v0.40.4.

**Status of the spike: the server side is settled on the dev machine (Option A and B both run; exiftool also ran in a throwaway unprivileged LXC).
iPhone Safari has been run once (section 4) and it changes the answer: its canvas re-encode writes an EXIF block, so Option B as first written would refuse every iPhone upload.
Android Chrome is not run, the probe needs one more iPhone run to show what is in Safari's EXIF block, and the real staging container does not exist yet.
The item stays open.**

## 1. The row to add to the log (top table)

| 2026-11-13 | **Photo spike result: Option B as written (refuse any upload that carries EXIF) cannot be S1's rule, because iPhone Safari's own canvas re-encode writes an EXIF block (no GPS) into every JPEG it makes. S1 builds Option A (exiftool `-all=` through `$os.cmd`, proven here and in a throwaway LXC) unless the Safari tag listing shows a narrower check works (B with an allowlist: no GPS IFD, no XMP/IPTC/COM/trailing data, only known harmless tags). Append-only photos stay (R-CAT-U-21 stays Allow); the `rev` re-read is a compare-and-swap, not "inside the save transaction".** A hook that refuses any EXIF, XMP, IPTC, comment, PNG text chunk or trailing data leaves nothing in originals or thumbnails and a refusal leaves zero files, but on iPhone Safari it refuses everything. Option A cleaned all four leaky fixtures (trailing data too) on create and on an added photo, and exiftool 13.25 ran as a service user under `NoNewPrivileges` and `ProtectSystem=strict` (temp files must be under `pb_data`, not `/tmp`). The append-only check runs before PocketBase deletes anything. `@request.body.photo:length` counts uploaded files. `judge.role` resolves against the submitted body. **Not finished: Android Chrome unrun; Safari's EXIF contents and the camera format setting not recorded; the real staging container not built.** | iPhone Safari: all 5 runs, canvas output EXIF YES, GPS no; GPS was in the delivered file in 3 of 5 (the server check matters); the camera and one picker run gave no DateTimeOriginal. Option A needs exiftool on the host (a second parser of untrusted files, kept patched) and a writable temp directory under `pb_data`. See `docs/evidence/m0-04-photo.txt`. | If Safari's EXIF block turns out to be a handful of harmless tags, an allowlist B avoids exiftool; if it holds anything else, A. A means exiftool on prod (check on the real staging first). Append-only is lost if a PocketBase upgrade changes when `onRecordUpdateRequest` sees the list |

## 2. Text to add under L2 (replacing "The Phase 2 spike decides")

### Result of the Phase 2 photo spike (2026-11-13)

**Q1. Which server option, and does anything leak?**

- *PocketBase alone leaks.* With no hook, `gps.jpg` is stored byte for byte with its EXIF GPS. Its thumbnail has no metadata,
  because PocketBase decodes and re-encodes to make one. Thumbnails are made on the first request (`?thumb=100x100`), not at
  upload, and `thumbs` is `[]` today. So only originals can leak.
- *Option B, tested.* The hook (`test/spike/hooks/photo_lib.js`, `strip_b.pb.js`) refuses a request when any uploaded file has a
  JPEG APP1 (EXIF or XMP), APP13 (IPTC) or COM segment, data after the end-of-image marker, a PNG `tEXt`/`zTXt`/`iTXt`/`eXIf` chunk,
  or is HEIF (it cannot be walked, so it fails closed). Results, on a two-photo create and on an added photo (`photo+`):

  | Fixture | Create `[clean-1.jpg, X]` | Add `X` to a 2-photo catch |
  |---|---|---|
  | `gps.jpg` (EXIF GPS) | refused, `photo_has_metadata`, 0 files stored | refused, stored files unchanged |
  | `xmp-gps.jpg` (XMP GPS, no EXIF) | same | same |
  | `text-chunk.png` (tEXt and iTXt) | same (the designed `image/jpeg` field refuses it on its own too: `validation_invalid_mime_type`, 0 files) | same |
  | `trailer-gps.jpg` (EXIF/XMP packet after the end marker; **extra, not one of L2's four**) | same | same |
  | `iphone.heic` (real iPhone 13, iOS 16.0, 4032x3024, with GPS and DateTimeOriginal) | refused, `photo_has_metadata` (HEIF cannot be walked, so it fails closed); the designed `image/jpeg` field refuses it first anyway (`validation_invalid_mime_type`) | same |
  | two clean JPEGs | stored; originals and thumbnails show no metadata | stored |

  Reading the upload in the hook is cheap: two 4.77 MB files create in 60 ms with no hook and 67 ms with the scan.
- *Option A, tested with exiftool 13.50 on the dev machine* (`exiftool -all= -overwrite_original` through `$os.cmd`, field widened so the PNG gets in).
  On a two-photo create and on an added photo, for `gps.jpg`, `xmp-gps.jpg`, `text-chunk.png` and `trailer-gps.jpg`: all 8 cases stored originals and
  thumbnails with no location data (scanner and exiftool dump both empty), and the existing photos were kept. `trailer-gps.jpg` came out byte-for-byte
  the size of `clean-1.jpg` (20738), so `-all=` also removes data after the end marker; no `-trailer:all=` is needed. Stored size of `gps.jpg`: 23931 to 23617.
  **Not tested through PocketBase: the real `iphone.heic`.** Run by hand on a copy: `-all=` removed EXIF and GPS (4147147 to 4144619 bytes), left only an Apple
  HDR gain-map XMP block (no location), and warned "ICC_Profile deleted. Image colors may be affected". The designed field refuses HEIC anyway.
  A still means a second parser of untrusted files, exiftool in the LXC, and an `$os.cmd` the unit's hardening allows.
- *Choice: not B as written; A, unless the allowlist form of B is shown to work.* B (refuse any EXIF) is proven on the server and needs nothing installed, and Desktop Chrome 157's canvas JPEG has only
  JFIF and ICC segments, so it passes there. **But iPhone Safari's canvas re-encode wrote an EXIF block in all five runs** (section 4), so B as written would refuse every upload from an iPhone.
  The probe could not say what is in that block (GPS no). The updated probe prints every segment and EXIF tag of the re-encoded output; one more iPhone run gives that list.
  - If the block is only harmless tags (orientation, colour space, pixel size, EXIF version and the like), S1 can build **B with an allowlist**: parse the EXIF, refuse a GPS IFD, XMP, IPTC, COM,
    trailing data, PNG chunks, HEIF and any tag not on the list. Nothing to install; the cost is a parser S1 owns and tests.
  - If it holds anything else, or the list differs by iOS version, build **A**: it cleans whatever is there, it ran on all four fixtures, and it works under the unit's hardening. Its cost is exiftool
    on the host, patched, with temp files under `pb_data`.
- *Can exiftool run in a container like the LXC?* **Yes, in a throwaway container (2026-11-13, run by Kayden; output pasted into the session).** Unprivileged Debian 13
  (trixie) LXC, nesting off, Proxmox host on Wi-Fi with a NATed bridge. `apt-get install libimage-exiftool-perl` gave exiftool **13.25** (well past 12.24). As a `pocketbase` system user under
  `systemd-run -p NoNewPrivileges=yes -p ProtectSystem=strict -p ReadWritePaths=<pb_data>`: wrote GPS and DateTimeOriginal to a test JPEG, then `exiftool -all= -overwrite_original` removed them (exit 0, both reads empty).
  With the scratch directory in `/tmp` instead, `mkdir` failed with "Read-only file system". So **under `ProtectSystem=strict` the hook must keep its temp files in a directory under `pb_data`**
  (or the unit needs `PrivateTmp=yes`). `-overwrite_original` writes its temp file next to the target, which also worked inside `pb_data`.
  **Not tested:** this was a shell check under the same hardening, not PocketBase calling exiftool through `$os.cmd` inside the LXC, and not the real staging container (CT still `TODO` in ops.md,
  and a different bridge may filter the Debian mirrors). Repeat `systemd-run` there when it exists. The throwaway container was destroyed afterwards.

**Q2. Can append-only be enforced before deletion?** Yes. R-CAT-U-21 stays **Allow**; R-CAT-U-34 to U-36 and U-40 stay.

- In `onRecordUpdateRequest`, before `e.next()`, `e.record.get("photo")` is the new list (kept names as strings, new uploads as file objects,
  `photo+` and `photo-` already applied) and `e.record.original().get("photo")` is the stored list. A hook that requires the new list to start with every
  stored name, in order, and throws `BadRequestError` otherwise, ran before anything was saved or deleted.
- Control (no hook): `photo-` on the first file deleted it from disk at once (`before: [a, b]`, `after: [b]`, only `b` left in storage).
- With the hook, each of these was refused with 400 `photo_append_only`, the files on disk were identical afterwards (same paths, sizes and sha256) and
  the record was unchanged: `photo-` of the first file; `photo-` of both; a full `photo` list without the first file plus a new file; the two files in the
  other order; a new file in the first place; an empty `photo` field. Allowed: `photo+` (first two kept in place), the same append written as a full list (old names in order, new file last), and an update that sends no `photo` at all.
- Caveat: this guards the API. A hook that calls `$app.save()` itself is not covered by a request hook, so S1's other hooks must never touch `photo`.

**Q3. The three rule mechanics (security.md open item 7).**

1. **`@request.body.photo:length` counts uploaded files in a multipart create.** With `photo:length >= 2`: 0 and 1 files refused, 2 and 4 allowed. The same
   request with the clause removed saves one file, so the clause is what refused it. 5 files pass the rule and the field refuses them (`validation_too_many_files`). Two filenames sent as
   plain text also count as 2, but the field refuses them (`validation_invalid_file`) and nothing is stored. A rule refusal is `400 "Failed to create record."` with empty `data`:
   the client can't tell which clause refused, so the app checks the photo count itself first.
2. **The update hook cannot re-read `rev` "inside the save transaction", because there is none.** `isTransactional()` is false in `onRecordUpdateRequest`, `onRecordUpdate`,
   `onRecordUpdateExecute` and `onRecordAfterUpdateSuccess`. Two photo adds sent together with the same `rev` (the hook waits 400 ms so both have passed the rule):

   | Check | Both allowed? | Result |
   |---|---|---|
   | none (the rule only) | yes | 3 photos on the record, 4 files on disk: one add was lost and its file orphaned |
   | re-read `rev` in `onRecordUpdate` (what security.md says) | yes | the re-read does not stop it |
   | **atomic `UPDATE catches SET rev = rev + 1 WHERE id = {:id} AND rev = {:rev}` in `onRecordUpdateExecute`; refuse unless one row changed** | **no: one allowed, one `400 rev_stale`** | 3 photos, rev 2, 3 files on disk |
   | check and save inside `e.app.runInTransaction` with `txApp.save()`, answering with `e.json()` | no: one allowed, one `400 rev_stale` | 3 photos, rev 2, 3 files on disk; skips the default response and later request hooks |

   Use the compare-and-swap. No idempotency key is needed, so open item 7's fallback does not apply. Reword security.md's "re-reads it inside the save transaction" to "swaps it atomically before the save".
3. **`judge.role` resolves against the submitted body in the events create rule.** With the exact rule from security.md: organizer creating with an organizer as judge: allowed;
   the same body with a member as judge: refused; an unknown user id as judge: refused; judge and backup judge the same: refused; a second organizer as backup: allowed; a member creating: refused.
   Refusals are `400 "Failed to create record."`, empty `data`.

**Q4. What each browser delivers.** iPhone Safari run once, over `http` (so `isSecureContext` was false; the real app is https). Android Chrome not run.

- UA: iPhone, iOS 18_7 in the string with `Version/26.5.2` (Safari freezes the OS in the UA, so the OS version is not reliable from it).
- *The canvas re-encode wrote an EXIF block in all five runs, GPS in none.* This is the finding that breaks B as written (see Q1).
- *The delivered file carried GPS in three of five runs* (the picker, `image/*` and `image/jpeg`, with a camera-roll JPEG, and the HEIC-accepting control with a JPEG): the location reaches the page, so the server check is a real second line of defence.
- *`DateTimeOriginal` was found in those same three runs* (with an offset, `-05:00`) and **not found in two**: the `image/jpeg` picker run and the `capture` (camera) run each delivered `image.jpg` (3.2 and 3.5 MB), with an EXIF block but no `DateTimeOriginal`, no GPS, and a `lastModified` of the moment of picking.
  So a photo taken through the camera control, and at least one picker case, arrives with no capture time in the file: the client would set `no_capture_time` for those.
- *No HEIC reached the page.* Every delivered file was `image/jpeg` (`IMG_*.jpeg` or `image.jpg`). Whether Safari converted a HEIC or the photos were already JPEG is unknown: **the Camera format setting and picker Location option were not recorded** (the template was not filled).

| Browser | Control | File delivered | DateTimeOriginal found | GPS in delivered file | Canvas re-encode: EXIF / GPS in output |
|---|---|---|---|---|---|
| iPhone Safari | #1 picker, `image/*` | `IMG_1399.jpeg`, 2.0 MB | 2026:11:12 17:35:16, -05:00 | YES | YES / no |
| iPhone Safari | #2 picker, `image/jpeg` | `image.jpg`, 3.2 MB | NOT FOUND | no | YES / no |
| iPhone Safari | #3 camera, `image/*` with `capture` | `image.jpg`, 3.5 MB | NOT FOUND | no | YES / no |
| iPhone Safari | #4 picker, `image/jpeg` | `IMG_1343.jpeg`, 4.9 MB | 2026:11:06 11:28:47, -05:00 | YES | YES / no |
| iPhone Safari | #5 picker, `image/heic,image/heif,image/jpeg` | `IMG_1308.jpeg`, 2.6 MB | 2026:11:04 00:03:37, -05:00 | YES | YES / no |
| Android Chrome | any | not run | | | |
| Desktop Chrome 157 (headless, canvas only) | n/a | n/a | n/a | n/a | no (JFIF and ICC only) / no |

Still needed from Kayden: one more iPhone run with the updated probe (it prints `output segments:` and `delivered segments:` lines), the Camera format setting, whether Location was on in the picker Options, which photos #2 and #3 were,
and Android Chrome.

**Other things found on v0.40.4 (S1 will meet them)**

- A function declared at the top level of a `*.pb.js` file is not visible inside its handlers (`ReferenceError: describe is not defined`). Shared code goes in a module loaded with `require(\`${__hooks}/name.js\`)`.
- `e.requestInfo().body` has typed values for multipart (`rev` arrives as the number 1) and the uploaded files under `photo`.
- `new BadRequestError(msg, { photo: new ValidationError(code, text) })` gives a field error; a plain object as the value comes back as "Invalid value".
- Each stored file has an `.attrs` sidecar holding content type, original filename and md5 (no location). A thumbnail lives at `thumbs_<file>/100x100_<file>`. `archive-event.sh` should expect both.
- `exiftool -all=` also removes the ICC profile and orientation tag (general behaviour, not tested here). Fine after a canvas re-encode, which bakes the rotation in.

## 3. Needs Kayden: exiftool in the LXC (only matters if B is rejected)

1. Dev machine: done. exiftool 13.50 installed; the eight Option A cases passed, `trailer-gps.jpg` included (see Q1).
2. LXC check: done in a throwaway unprivileged Debian 13 container (see Q1). Left for when the real staging CT exists: repeat the `systemd-run` check there with the unit's real user and `pb_data`.
3. exiftool has had remote-code-execution bugs on crafted files (CVE-2021-22204, fixed in 12.24, from memory: please check). A means keeping it patched on a host that parses members' uploads.

## 4. Needs Kayden: what is left on the phones

iPhone Safari's first run is in Q4 above. Still to do, with `docs/drafts/photo-spike-phone-steps.md` (the page now prints `delivered segments:` and `output segments:` lines):

1. iPhone Safari again: one run of each control, then paste Build results plus the template. Note the Camera format setting (High Efficiency or Most Compatible), whether Location was on in the picker Options, and which photos #2 and #3 were (fresh camera shots, screenshots, older photos).
   The `output segments:` line shows every tag in Safari's EXIF block: it decides between Option A and an allowlist B.
2. Android Chrome: the steps in the phone file. Not run at all.

## 5. Edits this implies in security.md (Kayden's to make)

- Open item 2: closed, append-only works; R-CAT-U-21 stays Allow.
- Open item 7: all three confirmed; the `rev` wording changes as in Q3.2 (the catches update hook paragraph and "Why `rev`").
- The catches hook paragraphs gain the photo rule once chosen: **not** "refuse any EXIF" (iPhone Safari's canvas writes some). Either Option A (exiftool, temp files under `pb_data`) or B with an allowlist (refuse GPS IFD, XMP, APP13, COM, trailing data, PNG text chunks, HEIF and any tag not allowed).
