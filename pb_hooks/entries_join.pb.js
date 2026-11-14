/// <reference path="../pb_data/types.d.ts" />
// Join (R-ENT-C-01, R-AUD-H-02, R-AUD-H-05; docs/security.md "entries" Hooks): when an entry is
// created, set display_name from the angler's current name and write one `join` audit row.
//
// Runs in goja: CommonJS only, no async/await, no Node or browser APIs.
//
// This is the model hook, not the request hook, on purpose: it runs inside the same transaction
// as the entry's INSERT (e.app after e.next()), so the entry and its audit row are saved together
// or not at all. The rule has already refused a body that sets display_name, withdrawn,
// withdraw_reason or withdrawn_by (R-ENT-C-06), so an API join always arrives here with those
// empty. A record created by the superuser (the test world, a later auto-entry of the judge)
// may bring its own display_name, and it is kept.
//
// The row's actor is the angler: through the API the rule makes the angler the caller, and the
// only other creator is the superuser, whose audit rows would otherwise have no actor to name.
onRecordCreate((e) => {
  const angler = e.record.getString("angler")

  if (e.record.getString("display_name") === "") {
    // A missing user is the validation's to refuse (angler is a required relation), not ours.
    try {
      e.record.set("display_name", e.app.findRecordById("users", angler).getString("name"))
    } catch (_) {
      // leave display_name empty; the save fails validation below
    }
  }

  e.next()

  const audit = new Record(e.app.findCollectionByNameOrId("audit_log"))
  audit.set("actor", angler)
  audit.set("action", "join")
  audit.set("event", e.record.getString("event"))
  audit.set("target_id", e.record.id)
  // Entry snapshot (security.md "Audit snapshots"); `before` stays empty on a join.
  audit.set("after", {
    withdrawn: e.record.getBool("withdrawn"),
    withdraw_reason: e.record.getString("withdraw_reason"),
    withdrawn_by: e.record.getString("withdrawn_by"),
  })
  e.app.save(audit)
}, "entries")
