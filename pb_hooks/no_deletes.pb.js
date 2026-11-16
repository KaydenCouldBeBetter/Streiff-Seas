/// <reference path="../pb_data/types.d.ts" />
// Nothing is ever deleted, not even by the superuser (R-ALL-D-02; decisions.md 2026-11-16 and
// Open item 15, from M0-02 review finding 1). The delete rules are null, so the API already
// refuses every member and organizer (R-ALL-D-01); this hook also stops the superuser and the
// admin UI. Deleting a user would empty audit_log.actor, entries.withdrawn_by and
// catches.judged_by on their rows, and an empty actor must mean only "the superuser did it".
// Runs in goja: CommonJS only, no async/await.
//
// A model hook, so it runs for every delete, whatever made it: the API, the admin UI, another
// hook or a migration. It throws before e.next(), so nothing is removed. A real emergency delete
// needs a deploy that changes this file, logged in ops.md section 12.
onRecordDelete((e) => {
  throw new BadRequestError("Records are never deleted. Retract, withdraw or rename instead.")
}, "users", "species", "events", "entries", "catches", "audit_log")
