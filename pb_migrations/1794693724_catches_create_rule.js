/// <reference path="../pb_data/types.d.ts" />
// S1-submit step 2: a member submits a catch to their own entry (R-CAT-C-01 to C-23). The create
// rule is the docs/security.md "catches" Create block line for line, so test/catches.test.ts can
// compare the stored text with the doc. It refuses the server-only fields (status, judged_by,
// reason, flags, rev) itself, before any hook runs; pb_hooks/catches_create.pb.js then strips
// every photo, sets status, rev and flags, and writes the create audit row. updateRule (edit,
// add photo, retract) stays null until its own step.
// Forward-only: no down function (docs/dev-lifecycle-guide.md).
migrate((app) => {
  const catches = app.findCollectionByNameOrId("catches")
  catches.createRule = [
    '@request.auth.id != "" &&',
    "entry.angler = @request.auth.id &&",
    "entry.withdrawn = false &&",
    'entry.event.status = "live" &&',
    "@now >= entry.event.starts_at &&",
    "@now <= entry.event.submit_deadline &&",
    "entry.event.species.id ?= species &&",
    '((entry.event.metric = "weight" && @request.body.weight_hoz > 0 && @request.body.length_q:isset = false) ||',
    ' (entry.event.metric = "length" && @request.body.length_q > 0 && @request.body.weight_hoz:isset = false)) &&',
    "@request.body.photo:length >= 2 &&",
    "@request.body.status:isset = false &&",
    "@request.body.judged_by:isset = false &&",
    "@request.body.reason:isset = false &&",
    "@request.body.flags:isset = false &&",
    "@request.body.rev:isset = false",
  ].join("\n")
  app.save(catches)
})
