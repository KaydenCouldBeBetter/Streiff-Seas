# Draft: decisions.md result of the photo spike (M0-04)

For Kayden to review and commit. Claude did not edit `decisions.md` or `security.md`.
Evidence: `docs/evidence/m0-04-photo.txt` (raw output). Tests: `test/upload.test.ts`, `test/spike/mechanics.test.ts`,
`test/spike/exifProbe.test.ts`. Fixtures: `scripts/make-photo-fixtures.py`. Binary: PocketBase v0.40.4.

**Status of the spike: the server side is settled on the dev machine (Option A was also run with exiftool 13.50 once Kayden installed it);
the LXC is not reachable from here, so "can exiftool run in the LXC" is still open; the browser side is not verified at all.
The item stays open until you paste the phone results.**

## 1. The row to add to the log (top table)

| 2026-11-13 | **Photo spike result: build Option B (fail closed) in S1; append-only photos stay (R-CAT-U-21 stays Allow); the `rev` re-read is a compare-and-swap, not "inside the save transaction".** On v0.40.4, a hook that refuses any upload carrying EXIF, XMP, IPTC, a JPEG comment, PNG text chunks or data after the JPEG end marker leaves no location data in any original or thumbnail, on a two-photo create and on an added photo, and a refused request leaves zero files in `pb_data`. The append-only check runs before PocketBase deletes anything. `@request.body.photo:length` counts uploaded files. `judge.role` resolves against the submitted body. **Browser step not verified: needs Kayden's phone results (below).** | Option B is proven here and costs about 7 ms on two 4.8 MB files. Option A needs exiftool in the LXC (not checked), a second parser of untrusted files running as the PocketBase user, and an `$os.cmd` allowed by the unit's hardening. See `docs/evidence/m0-04-photo.txt`. | B stops working if a phone's canvas re-encode writes EXIF/XMP (every submission would be refused: then A, or a smaller B that refuses only GPS); append-only is lost if a PocketBase upgrade changes when `onRecordUpdateRequest` sees the list |

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
- *Choice: B (A also works here, so it is a sound fallback).* B is proven, small, and needs nothing installed. It turns the client re-encode from a first line of defence into a rule the server
  enforces. The client already has to re-encode (canvas to JPEG) for size, and the field only takes `image/jpeg`.
- *What B costs.* A client that skips the re-encode, or a browser whose canvas writes metadata, gets its submission refused instead of cleaned.
  Desktop Chrome 157's canvas JPEG has only JFIF and ICC segments, so B passes it (evidence file). **iPhone Safari and Android Chrome must be
  checked: the probe prints "EXIF in output".** If a phone's re-encode carries APP1 or COM, B as written refuses every upload from it.
- *Can exiftool run in the LXC?* **Needs Kayden.** I cannot reach it. Check on the staging LXC first (steps in section 3).

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

**Q4. What each browser delivers.** Not verified. Fill in from the phones (section 4).

**Other things found on v0.40.4 (S1 will meet them)**

- A function declared at the top level of a `*.pb.js` file is not visible inside its handlers (`ReferenceError: describe is not defined`). Shared code goes in a module loaded with `require(\`${__hooks}/name.js\`)`.
- `e.requestInfo().body` has typed values for multipart (`rev` arrives as the number 1) and the uploaded files under `photo`.
- `new BadRequestError(msg, { photo: new ValidationError(code, text) })` gives a field error; a plain object as the value comes back as "Invalid value".
- Each stored file has an `.attrs` sidecar holding content type, original filename and md5 (no location). A thumbnail lives at `thumbs_<file>/100x100_<file>`. `archive-event.sh` should expect both.
- `exiftool -all=` also removes the ICC profile and orientation tag (general behaviour, not tested here). Fine after a canvas re-encode, which bakes the rotation in.

## 3. Needs Kayden: exiftool in the LXC (only matters if B is rejected)

1. Dev machine: done. exiftool 13.50 installed; the eight Option A cases passed, `trailer-gps.jpg` included (see Q1).
2. On the **staging** LXC (not prod): `apt-get install -y libimage-exiftool-perl && exiftool -ver`. Then, as the PocketBase user and under the unit's hardening
   (`NoNewPrivileges`, `ProtectSystem=strict`, writes only to `pb_data`; the unit file is still `TODO` in ops.md), confirm it can write a temp file and run exiftool on it. A temp file in `/tmp` fails under `ProtectSystem=strict` unless the unit has `PrivateTmp=yes`, so the hook would need a directory under `pb_data`.
3. exiftool has had remote-code-execution bugs on crafted files (CVE-2021-22204, fixed in 12.24, from memory: please check). A means keeping it patched on a host that parses members' uploads.

## 4. Needs Kayden: phone results

Follow `docs/drafts/photo-spike-phone-steps.md` and paste the filled template into the thread. Then fill the rows:

| Browser | Control | File delivered | DateTimeOriginal found | GPS in delivered file | Canvas re-encode: EXIF in output |
|---|---|---|---|---|---|
| iPhone Safari | picker, `image/*` | | | | |
| iPhone Safari | picker, `image/jpeg` | | | | |
| iPhone Safari | camera, `capture` | | | | |
| iPhone Safari | picker, `image/heic,...` (a HEIC photo) | | | | |
| Android Chrome | picker, `image/*` | | | | |
| Android Chrome | camera, `capture` | | | | |
| Desktop Chrome 157 (done, headless, canvas only) | n/a | n/a | n/a | n/a | no (JFIF and ICC only) |

## 5. Edits this implies in security.md (Kayden's to make)

- Open item 2: closed, append-only works; R-CAT-U-21 stays Allow.
- Open item 7: all three confirmed; the `rev` wording changes as in Q3.2 (the catches update hook paragraph and "Why `rev`").
- The catches hook paragraphs gain: the Option B rule (refuse on any APP1, APP13, COM, trailing data, PNG text chunks or HEIF).
