/// <reference path="../pb_data/types.d.ts" />
// Name sync (R-USR-U-06, docs/security.md "Hook (users update)"): when a member's `name` changes,
// copy it to `display_name` on their entries in events that are not final. Final results keep
// the name they were published with (scoring.md section 9).
//
// Runs in goja: CommonJS only, no async/await, no Node or browser APIs.
//
// It runs inside the same transaction as the users save (e.app after e.next()), so the name and
// the entries move together or not at all. The entries are saved with hooks off: a rename is not
// a join, withdraw or rejoin, and the entries hooks the S1 item adds must not treat it as one.
onRecordUpdate((e) => {
  const before = e.record.original().getString("name")
  const after = e.record.getString("name")

  e.next()

  if (before === after) return

  const entries = e.app.findRecordsByFilter(
    "entries",
    'angler = {:angler} && event.status != "final"',
    "",
    0,
    0,
    { angler: e.record.id },
  )
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    entry.set("display_name", after)
    e.app.unsafeWithoutHooks().save(entry)
  }
}, "users")
