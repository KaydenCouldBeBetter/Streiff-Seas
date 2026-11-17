/// <reference path="../pb_data/types.d.ts" />
// Withdraw and rejoin (R-ENT-U-01 to U-14, R-AUD-H-02, H-05; docs/security.md "entries" Hooks):
// set withdrawn_by to the caller on a withdraw and clear it on a rejoin, then write one
// `withdraw` or `rejoin` audit row. Runs in goja: CommonJS only, no async/await.
//
// A request hook, because withdrawn_by is the caller and only the request knows who that is.
// On v0.40.4 PocketBase checks an update rule before this hook runs (unlike create): a refused
// request never gets here, so nothing is saved and no row is written (R-AUD-H-04), and nobody
// learns from this hook's 400s that a hidden entry exists (test/entries.test.ts pins both). The
// rule also refuses a body that sends withdrawn_by, so setting it here can't widen anything.
//
// Not atomic: on v0.40.4 no record update hook runs in a transaction (M0-04 spike, Q3.2), so the
// audit row is saved right after the entry. Only our own fixed values go into it.
//
// The superuser (the test world, the admin UI) bypasses rules and this hook alike.
onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth() || !e.auth) return e.next()

  const original = e.record.original()
  const was = original.getBool("withdrawn")
  const now = e.record.getBool("withdrawn")
  const before = {
    withdrawn: was,
    withdraw_reason: original.getString("withdraw_reason"),
    withdrawn_by: original.getString("withdrawn_by"),
  }

  const owner = e.record.getString("angler") === e.auth.id

  // The rule lets the organizer send withdrawn = true to an entry that already is. That changes
  // nothing, so it is not an entry change and gets no row.
  if (was === now) {
    throw new BadRequestError(now ? "Already withdrawn." : "Already in the tournament.", {
      withdrawn: new ValidationError("withdrawn_unchanged", "Nothing to change."),
    })
  }
  // The rule asks for a reason when the organizer withdraws someone else; a reason of spaces isn't one (R-ENT-U-08).
  if (now && !owner && e.record.getString("withdraw_reason").trim() === "") {
    throw new BadRequestError("A reason is needed to withdraw someone else.", {
      withdraw_reason: new ValidationError("withdraw_reason_required", "Say why."),
    })
  }

  e.record.set("withdrawn_by", now ? e.auth.id : "")

  e.next()

  const audit = new Record(e.app.findCollectionByNameOrId("audit_log"))
  audit.set("actor", e.auth.id)
  audit.set("action", now ? "withdraw" : "rejoin")
  audit.set("event", e.record.getString("event"))
  audit.set("target_id", e.record.id)
  audit.set("before", before)
  audit.set("after", {
    withdrawn: e.record.getBool("withdrawn"),
    withdraw_reason: e.record.getString("withdraw_reason"),
    withdrawn_by: e.record.getString("withdrawn_by"),
  })
  e.app.save(audit)
}, "entries")
