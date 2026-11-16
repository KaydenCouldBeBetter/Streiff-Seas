/// <reference path="../pb_data/types.d.ts" />
// Catch update by the angler (docs/security.md "catches" Hooks, On update by the angler;
// R-CAT-U-16 to U-30, U-32, U-34 to U-36, U-39, U-40; R-AUD-H-01, H-04, H-05). Runs in goja:
// CommonJS only, no async/await.
//
// On v0.40.4 an update rule is checked before onRecordUpdateRequest runs (test/entries.test.ts
// pins it), so a request that gets here has passed the rule: the caller is the angler with a
// pending catch, a live event, before the deadline, echoing the stored rev; or a judge (S3).
//
// The judge branch of the rule is live text, but judging isn't built: its hook (judged_by, the
// correct-means-verified rule, approve/reject/correct rows) is S3's. Until then every judge request
// is refused here, so no catch can change without its audit row.
//
// Not atomic: no record update hook runs in a transaction on v0.40.4 (M0-04 spike), so the audit
// row is saved right after the catch. The rev compare-and-swap below is what keeps two requests
// with the same rev from both landing.
onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth() || !e.auth) return e.next()

  const lib = require(`${__hooks}/catch_lib.js`)
  const record = e.record
  const original = record.original()
  const entry = e.app.findRecordById("entries", original.getString("entry"))

  if (entry.getString("angler") !== e.auth.id) {
    throw new BadRequestError("Judging isn't available yet.", {
      status: new ValidationError("judging_not_available", "The judge's screens come with S3."),
    })
  }

  const before = lib.catchSnapshot(original)

  // Append-only (R-CAT-U-26): the new list starts with every stored name, in order, and anything
  // after them is a new upload. Checked before e.next(), so a refused request deletes nothing.
  const stored = original.getStringSlice("photo")
  const sent = record.get("photo")
  let kept = sent.length >= stored.length
  for (let i = 0; kept && i < sent.length; i++) {
    kept = i < stored.length ? sent[i] === stored[i] : typeof sent[i] !== "string"
  }
  if (!kept) {
    throw new BadRequestError("Photos can only be added, never removed or replaced.", {
      photo: new ValidationError("photo_append_only", "The stored photos must stay, in order."),
    })
  }
  const added = record.getUnsavedFiles("photo")
  if (added.length > 0) record.set("photo", stored.concat(lib.stripPhotos(e.app, added)))
  const photoCount = stored.length + added.length

  // photo_captured_at (R-CAT-U-36): one entry per photo, the stored ones unchanged.
  let times
  try {
    const storedTimes = lib.capturedList(original) || []
    const list = lib.capturedList(record)
    if (list === null || list.length !== photoCount) throw new Error("count")
    times = list.map(lib.dateMs)
    for (let i = 0; i < storedTimes.length; i++) {
      if (lib.dateMs(storedTimes[i]) !== times[i]) throw new Error("changed")
    }
  } catch (_) {
    throw new BadRequestError("Each photo needs its capture time entry, and the existing ones can't change.", {
      photo_captured_at: new ValidationError("photo_captured_at_invalid", "One entry per photo; existing entries unchanged."),
    })
  }

  const retracting = record.getString("status") === "retracted"
  const measured =
    record.getString("species") !== original.getString("species") ||
    record.getInt("weight_hoz") !== original.getInt("weight_hoz") ||
    record.getInt("length_q") !== original.getInt("length_q")

  if (retracting && (measured || added.length > 0)) {
    throw new BadRequestError("Retract on its own: edits and photos don't go with it.", {
      status: new ValidationError("retract_alone", "Send the retract by itself."),
    })
  }
  if (!retracting && !measured && added.length === 0) {
    throw new BadRequestError("Nothing to change.", {
      rev: new ValidationError("nothing_changed", "The request changes nothing."),
    })
  }

  // Flags only ever gain codes (security.md "Flag codes"): photo_added, and per added photo
  // extra_photo_no_time or extra_photo_far (R-CAT-U-21, U-34, U-35).
  if (added.length > 0) {
    const captured = lib.dateMs(original.getString("captured_at"))
    record.set("flags", lib.addedPhotoFlags(before.flags, captured, times.slice(stored.length)))
  }

  e.next()

  const audit = new Record(e.app.findCollectionByNameOrId("audit_log"))
  audit.set("actor", e.auth.id)
  audit.set("action", retracting ? "retract" : "edit")
  audit.set("event", entry.getString("event"))
  audit.set("catch", record.id)
  audit.set("target_id", record.id)
  audit.set("before", before)
  audit.set("after", lib.catchSnapshot(record))
  e.app.save(audit)
}, "catches")

// The rev compare-and-swap (R-CAT-U-40; M0-04 spike Q3.2): one atomic UPDATE right before the
// save, so of two requests that passed the rule with the same rev, exactly one lands and the other
// is refused with rev_stale, its upload never stored. It runs for every catch update, the
// superuser's too: any change moves rev, so a screen holding the old one reloads.
onRecordUpdateExecute((e) => {
  const expected = e.record.getInt("rev")
  const result = e.app
    .db()
    .newQuery("UPDATE catches SET rev = rev + 1 WHERE id = {:id} AND rev = {:rev}")
    .bind({ id: e.record.id, rev: expected })
    .execute()
  if (result.rowsAffected() !== 1) {
    throw new BadRequestError("The catch changed since you loaded it.", {
      rev: new ValidationError("rev_stale", "Reload the catch and try again."),
    })
  }
  e.record.set("rev", expected + 1)
  e.next()
}, "catches")
