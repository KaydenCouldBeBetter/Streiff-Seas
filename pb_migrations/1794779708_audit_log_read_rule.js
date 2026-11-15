/// <reference path="../pb_data/types.d.ts" />
// S1-submit: members read the audit history of any catch they can see (R-AUD-L-01 to L-09), so
// My catch and Catch history can show decisions, corrections, edits and retracts. The rule is the
// docs/security.md "audit_log" List / view block line for line; test/rules.test.ts compares the
// stored text with the doc. View = list. Event and entry rows have no `catch`, so only the
// organizer branch matches them. Create, update and delete stay null: hooks write through
// $app.save(), which bypasses rules.
// These rows are listed under S3-judge's "Audit visibility" step in features.json; S1 opens the
// read rule early because My catch needs it (handoff 2026-11-15).
// Forward-only: no down function (docs/dev-lifecycle-guide.md).
migrate((app) => {
  const collection = app.findCollectionByNameOrId("audit_log")
  const rule = [
    '@request.auth.id != "" &&',
    '(@request.auth.role = "organizer" ||',
    " catch.entry.event.judge = @request.auth.id ||",
    " catch.entry.angler = @request.auth.id ||",
    " (catch.entry.event.backup_judge = @request.auth.id &&",
    "  catch.entry.angler = catch.entry.event.judge) ||",
    ' (catch != "" &&',
    '  catch.status != "rejected" && catch.status != "retracted" &&',
    "  catch.entry.withdrawn = false))",
  ].join("\n")
  collection.listRule = rule
  collection.viewRule = rule
  app.save(collection)
})
