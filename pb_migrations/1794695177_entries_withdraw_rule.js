/// <reference path="../pb_data/types.d.ts" />
// S1-submit step 4: withdraw and rejoin (R-ENT-U-01 to U-14). The update rule is the
// docs/security.md "entries" Update block line for line, both branches: an angler withdrawing or
// rejoining themselves, and the organizer withdrawing (with a reason, unless it's their own entry)
// or reinstating anyone. It refuses a body that touches event, angler, display_name or
// withdrawn_by; pb_hooks/entries_withdraw.pb.js sets withdrawn_by and writes the withdraw or
// rejoin audit row. deleteRule stays null (R-ENT-D-01).
// Forward-only: no down function (docs/dev-lifecycle-guide.md).
migrate((app) => {
  const entries = app.findCollectionByNameOrId("entries")
  entries.updateRule = [
    '@request.auth.id != "" &&',
    'event.status != "final" &&',
    "@request.body.withdrawn:isset = true &&",
    "@request.body.event:isset = false &&",
    "@request.body.angler:isset = false &&",
    "@request.body.display_name:isset = false &&",
    "@request.body.withdrawn_by:isset = false &&",
    "(",
    "  (angler = @request.auth.id &&",
    "   @request.body.withdraw_reason:isset = false &&",
    "   ((@request.body.withdrawn = true && withdrawn = false) ||",
    "    (@request.body.withdrawn = false && withdrawn = true &&",
    "     withdrawn_by = @request.auth.id &&",
    '     event.status = "live" && @now <= event.submit_deadline)))',
    "  ||",
    '  (@request.auth.role = "organizer" &&',
    "   (@request.body.withdrawn = false ||",
    "    angler = @request.auth.id ||",
    '    @request.body.withdraw_reason != ""))',
    ")",
  ].join("\n")
  app.save(entries)
})
