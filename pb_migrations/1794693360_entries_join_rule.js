/// <reference path="../pb_data/types.d.ts" />
// S1-submit step 1: members join a live tournament themselves (R-ENT-C-01 to C-08). The create
// rule is the docs/security.md "entries" Create block line for line, so test/rules.test.ts can
// compare the stored text with the doc. The server-only fields (display_name, withdrawn,
// withdraw_reason, withdrawn_by) are refused here, before any hook runs; pb_hooks/entries_join.pb.js
// then sets display_name and writes the join audit row. updateRule (withdraw, rejoin) stays null
// until its own step. One entry per angler per event is the unique index from the create_entries
// migration (R-ENT-C-03, C-08).
// Forward-only: no down function (docs/dev-lifecycle-guide.md).
migrate((app) => {
  const entries = app.findCollectionByNameOrId("entries")
  entries.createRule = [
    '@request.auth.id != "" &&',
    "@request.body.angler = @request.auth.id &&",
    'event.status = "live" &&',
    "@now <= event.submit_deadline &&",
    "@request.body.display_name:isset = false &&",
    "@request.body.withdrawn:isset = false &&",
    "@request.body.withdraw_reason:isset = false &&",
    "@request.body.withdrawn_by:isset = false",
  ].join("\n")
  app.save(entries)
})
