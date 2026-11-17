/// <reference path="../pb_data/types.d.ts" />
// Catch create (docs/security.md "catches" Hooks, On create; R-CAT-C-01, C-16, C-19 to C-22,
// R-AUD-H-01, H-05). Runs in goja: CommonJS only, no async/await, no Node or browser APIs.
//
// This is the model hook, not the request hook, on purpose:
// - PocketBase checks the create rule before it saves, and a request hook runs before that check.
//   Here, the rule has already passed, so a refused or anonymous request never reaches exiftool,
//   a parser of untrusted files.
// - It runs inside the INSERT's transaction (e.app after e.next()), so the catch and its audit
//   row are saved together or not at all.
//
// Every photo goes through the strip, whoever creates the catch. The rest applies to a catch a
// member submits, which the rule guarantees arrives with no status, rev or flags; a record that
// already has a status was made by the superuser (the test world) and keeps what it was given.
onRecordCreate((e) => {
  const lib = require(`${__hooks}/catch_lib.js`)
  const record = e.record

  const files = record.getUnsavedFiles("photo")
  if (files.length > 0) record.set("photo", lib.stripPhotos(e.app, files))

  if (record.getString("status") === "") {
    // Backs up the rule's `@request.body.photo:length >= 2` (R-CAT-C-21).
    if (files.length < 2) {
      throw new BadRequestError("A catch needs both required photos.", {
        photo: new ValidationError("photo_required", "Both required photos are needed."),
      })
    }

    // One capture time per photo, the first equal to captured_at; both may be empty (R-CAT-C-19).
    let times
    let captured
    try {
      const list = lib.capturedList(record)
      if (list === null || list.length !== files.length) throw new Error("count")
      times = list.map(lib.dateMs)
      captured = lib.dateMs(record.getString("captured_at"))
    } catch (_) {
      throw new BadRequestError("Each photo needs its capture time entry.", {
        photo_captured_at: new ValidationError("photo_captured_at_invalid", "One entry per photo, the first equal to captured_at."),
      })
    }
    if (times[0] !== captured) {
      throw new BadRequestError("The first photo's capture time must match captured_at.", {
        photo_captured_at: new ValidationError("photo_captured_at_mismatch", "The first entry must equal captured_at."),
      })
    }

    const entry = e.app.findRecordById("entries", record.getString("entry"))
    const event = e.app.findRecordById("events", entry.getString("event"))
    record.set("status", "pending")
    record.set("rev", 1)
    record.set(
      "flags",
      lib.createFlags(captured, times, lib.dateMs(event.getString("starts_at")), lib.dateMs(event.getString("ends_at")), Date.now()),
    )
  }

  e.next()

  const entry = e.app.findRecordById("entries", record.getString("entry"))
  const audit = new Record(e.app.findCollectionByNameOrId("audit_log"))
  audit.set("actor", entry.getString("angler"))
  audit.set("action", "create")
  audit.set("event", entry.getString("event"))
  audit.set("catch", record.id)
  audit.set("target_id", record.id)
  // `before` stays empty on a create (R-AUD-H-05).
  audit.set("after", lib.catchSnapshot(record))
  e.app.save(audit)
}, "catches")
