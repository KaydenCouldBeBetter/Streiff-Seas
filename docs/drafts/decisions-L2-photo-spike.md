# Draft: decisions.md result of the photo spike (M0-04)

For Kayden to review and commit. Claude did not edit `decisions.md` or `security.md`.
Evidence: `docs/evidence/m0-04-photo.txt` (raw output). Tests: `test/upload.test.ts`, `test/spike/mechanics.test.ts`,
`test/spike/exifProbe.test.ts`. Fixtures: `scripts/make-photo-fixtures.py`. Binary: PocketBase v0.40.4.

**Status of the spike: answered, with one gap that Kayden cannot close (no Android phone).** Server side: Option A and B both run on v0.40.4; exiftool also ran in a throwaway unprivileged LXC.
iPhone Safari: run twice (section 4). Its canvas re-encode writes an EXIF block and a Photoshop APP13 block (no GPS), so Option B as first written would refuse every iPhone upload; the recommendation is now Option A.
**Not verified: Android Chrome (no Android phone), the contents of Safari's APP13 block (the probe now prints its resource ids), and the real staging container (does not exist yet).**
`passes` stays false for those; Kayden decides whether to close the item with Android recorded as untested.

## 1. The row to add to the log (top table)

| 2026-11-13 | **Photo spike result: S1 builds Option A (exiftool `-all=` through `$os.cmd`), then refuses the photo if anything location-capable is still in the cleaned bytes. Option B as first written (refuse any upload that carries EXIF) is dropped: iPhone Safari's canvas re-encode writes an EXIF block and an APP13 block into every JPEG it makes. Append-only photos stay (R-CAT-U-21 stays Allow); the `rev` re-read is a compare-and-swap, not "inside the save transaction".** Option A cleaned all four leaky fixtures (trailing data too) on create and on an added photo, with nothing left in originals or thumbnails; exiftool 13.25 ran as a service user under `NoNewPrivileges` and `ProtectSystem=strict` in an unprivileged Debian 13 LXC (temp files must be under `pb_data`, not `/tmp`). The append-only check runs before PocketBase deletes anything. `@request.body.photo:length` counts uploaded files. `judge.role` resolves against the submitted body. **Not verified: Android Chrome (no Android phone), the real staging container.** | iPhone Safari (two runs, 9 files): the canvas output was identical every time (JFIF, a 76-byte Exif block holding only ColorSpace and pixel size, a 56-byte Photoshop APP13 block, no GPS, no XMP, nothing after the end marker), so a strict allowlist B would pass it, but Android is unknown and an unexpected tag would refuse a real catch; A cleans whatever arrives. Delivered iPhone files carry GPS, MakerNote, XMP and APP10 when location is on, so the server step is not optional. A needs exiftool on the host (a second parser of untrusted files, kept patched). See `docs/evidence/m0-04-photo.txt`, `docs/evidence/m0-04-iphone-safari.txt`. | A means exiftool on prod: check it on the real staging first and keep it patched; if exiftool is unwanted, the no-dependency alternative is the allowlist B, but only after Android Chrome is checked. Append-only is lost if a PocketBase upgrade changes when `onRecordUpdateRequest` sees the list |

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
- *Choice: A, then verify.* B (refuse any EXIF) is proven on the server, but **iPhone Safari's canvas re-encode wrote an EXIF block and an APP13 block in every run** (section 4), so B as written would refuse every iPhone upload.
  Safari's output is small and constant (EXIF with ColorSpace and pixel size only; APP13 of 56 bytes whose contents are not yet recorded), so an allowlist B (parse, refuse a GPS IFD, XMP, COM, trailing data, any other tag, any APP13 resource id not on a list) would pass it
  and needs nothing installed. It is not the pick because Android Chrome was never run: any tag it writes that is not on the list would refuse a real catch, possibly at the deadline. A strips whatever arrives. So: run `exiftool -all=` on each upload,
  then scan the cleaned bytes with the B walker and refuse (`photo_has_metadata`) if anything location-capable remains. The two pieces were each tested here (A on the four fixtures; the walker as B); the combined hook is S1's to write and test.
  A by-hand check: `exiftool -all=` on a JPEG with IPTC (City, Sub-location) removed the APP13 block (and APP0) entirely.
  If exiftool on prod is unwanted, use the allowlist B instead, after Android Chrome has been run.
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

**Q4. What each browser delivers.** iPhone Safari run twice (iPhone 16 Pro, Safari 26.5.2, UA shows `iPhone OS 18_7` because Safari freezes the OS in the string), over `http` so `isSecureContext` was false (the real app is https).
Camera format: High Efficiency; Location believed on for all runs (Kayden's recollection). Android Chrome: **not run, no Android phone**.

- *Canvas re-encode output, identical in all four second-run files:* `APP0(JFIF)`, `APP1(Exif)` of 76 bytes (IFD0 holds only the ExifIFD pointer; ExifIFD holds `0xa001` ColorSpace = 1, `0xa002` and `0xa003` pixel width and height of the output),
  `APP13(Photoshop 3.0)` of 56 bytes, the image data, nothing after the end marker. No GPS IFD, no XMP, no COM, no Make/Model, no capture time. The 56-byte APP13 block is the same size whatever the input,
  so it looks like fixed boilerplate, but its resource ids were not printed (the probe now prints them: `0x0404` would be IPTC). The first run's outputs also had EXIF and no GPS (segment lists were not printed then).
- *High Efficiency photos arrive as JPEG.* Every picked file in both runs was `image/jpeg` named `IMG_nnnn.jpeg`; no HEIC reached the page, even from the control that accepts `image/heic`. Safari converts on pick.
- *The delivered (converted) file keeps the metadata.* The three library photos in run two with a Make carried `Apple` / `iPhone 16 Pro`, Software, `DateTimeOriginal` with offset (`-05:00` or `-04:00`), a MakerNote of about 2 KB, an XMP block of 3.4 to 3.7 KB, `APP10`, and (when the photo had a location) a full GPS IFD: latitude, longitude, altitude, speed, direction, date.
  So the client re-encode is what removes GPS, MakerNote and XMP; skipping it would put all of it on the server.
- *A fresh library photo can arrive with no GPS IFD* (`IMG_1398`, 2026-11-12, location believed on). A photo's location depends on the photo, not only the picker.
- *A live camera shot (`capture`) arrives with no capture time.* `image.jpg`, EXIF holding only orientation, resolution and pixel size (no Make/Model, no `DateTimeOriginal`, no GPS), `lastModified` = the moment of capture. In the first run the other `image.jpg` (control 2, `accept="image/jpeg"`)
  did the same, almost certainly a camera shot taken through that picker (not confirmed). So for any photo taken live on an iPhone, `captured_at` cannot come from the file: the client sets `no_capture_time`. A photo picked from the library keeps `DateTimeOriginal`.

| Browser | Run, control | File delivered | DateTimeOriginal | GPS in delivered file | Canvas output: EXIF / GPS |
|---|---|---|---|---|---|
| iPhone Safari | 1 #1 `image/*`, fresh library photo | `IMG_1399.jpeg` | 2026:11:12 17:35:16, -05:00 | YES | EXIF / no |
| iPhone Safari | 1 #2 `image/jpeg`, probably a camera shot | `image.jpg` | NOT FOUND | no | EXIF / no |
| iPhone Safari | 1 #3 `capture` | `image.jpg` | NOT FOUND | no | EXIF / no |
| iPhone Safari | 1 #4 `image/jpeg`, library | `IMG_1343.jpeg` | 2026:11:06 11:28:47, -05:00 | YES | EXIF / no |
| iPhone Safari | 1 #5 `image/heic,...`, library | `IMG_1308.jpeg` | 2026:11:04 00:03:37, -05:00 | YES | EXIF / no |
| iPhone Safari | 2 #1 `image/*`, fresh library photo | `IMG_1398.jpeg` | 2026:11:12 17:34:30, -05:00 | no | EXIF + APP13 / no |
| iPhone Safari | 2 #2 `image/jpeg`, old library photo | `IMG_1355.jpeg` | 2026:11:08 13:57:06, -05:00 | YES | EXIF + APP13 / no |
| iPhone Safari | 2 #3 `capture`, live | `image.jpg` | NOT FOUND | no | EXIF + APP13 / no |
| iPhone Safari | 2 #4 `image/heic,...`, library | `IMG_0581.jpeg` | 2026:07:12 11:26:30, -04:00 | YES | EXIF + APP13 / no |
| Android Chrome | any | **not run** | | | |
| Desktop Chrome 157 (headless, canvas only) | n/a | n/a | n/a | n/a | no (JFIF and ICC only) / no |

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

## 4. What is left

1. Android Chrome: not run (no Android phone). If a member or friend has one, `docs/drafts/photo-spike-phone-steps.md` takes about ten minutes. Until then the allowlist B stays unproven and A is the pick because it does not depend on what Android writes.
2. Optional: reload the probe on the iPhone and pick any one photo; the output line now shows the APP13 `8BIM[...]` resource ids (`0x0404` would be IPTC). Only needed if S1 ever uses the allowlist B.
3. The real staging container: repeat the exiftool `systemd-run` check there when it exists.

## 5. Edits this implies in security.md (Kayden's to make)

- Open item 2: closed, append-only works; R-CAT-U-21 stays Allow.
- Open item 7: all three confirmed; the `rev` wording changes as in Q3.2 (the catches update hook paragraph and "Why `rev`").
- The catches hook paragraphs gain the photo rule: strip every upload with exiftool (`-all=`, temp files under `pb_data`), then refuse if the cleaned bytes still carry anything location-capable. **Not** "refuse any EXIF": iPhone Safari's canvas writes some.
