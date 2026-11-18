/// <reference path="../pb_data/types.d.ts" />
// Event create (docs/security.md "Hook (events create)"; R-EVT-C-01, C-07 to C-09, R-AUD-H-02,
// H-05). Runs in goja: CommonJS only, no async/await.
//
// A request hook, because the `join` rows name the organizer who created the event, and only the
// request knows who that is. On v0.40.4 the create rule is checked inside e.next(), after this hook
// starts, so nothing here refuses or reveals anything before the rule has run: a member's or
// anonymous create gets the rule's own answer (R-EVT-C-02).
//
// The save, the judge's and backup judge's entries and their join rows run in one transaction
// (e.app swapped for the transaction's app), so they land together or not at all.
//
// The superuser (the test world, the admin UI) passes through untouched: it makes events in any
// state, with entries of its own (decisions.md 2026-11-17, S4 backend calls).
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth() || !e.auth) return e.next()

  const lib = require(`${__hooks}/event_lib.js`)
  const actor = e.auth.id
  const record = e.record

  // Hook-set: the rule refuses a body that sends either (R-EVT-C-04, C-06).
  record.set("deadline_ext_min", 0)
  record.set("submit_deadline", lib.deadlineOf(record.getString("ends_at"), 0))

  e.app.runInTransaction((txApp) => {
    e.app = txApp
    e.next()

    // Backs up the rule's `judge.role = "organizer"` (R-EVT-C-07).
    if (!lib.isOrganizer(txApp, record.getString("judge"))) {
      throw lib.refuse("judge", "judge_not_organizer", "The judge must be an organizer.")
    }
    lib.enterIfMissing(txApp, record.id, record.getString("judge"), actor)
    lib.enterIfMissing(txApp, record.id, record.getString("backup_judge"), actor)
  })
}, "events")
