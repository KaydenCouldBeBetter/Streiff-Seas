/// <reference path="../pb_data/types.d.ts" />
// S1-submit step 5: the angler edits, adds photos to or retracts their own pending catch
// (R-CAT-U-16 to U-30, U-32, U-34 to U-36, U-39, U-40). The update rule is the docs/security.md
// "catches" Update block line for line, both branches. The judge branch (S3) is in the text but
// not usable yet: pb_hooks/catches_update.pb.js refuses every judge request until S3 builds the
// judge's hook and audit rows, so no catch changes without its row. The rule refuses the
// server-only fields and a missing or stale rev itself; the hook keeps photos append-only, strips
// added photos, adds flags, writes the audit row, and swaps rev atomically before the save.
// Forward-only: no down function (docs/dev-lifecycle-guide.md).
migrate((app) => {
  const catches = app.findCollectionByNameOrId("catches")
  catches.updateRule = [
    '@request.auth.id != "" &&',
    "@request.body.entry:isset = false &&",
    "@request.body.captured_at:isset = false &&",
    "@request.body.client_uuid:isset = false &&",
    "@request.body.judged_by:isset = false &&",
    "@request.body.flags:isset = false &&",
    "(@request.body.species:isset = false || entry.event.species.id ?= @request.body.species) &&",
    '(@request.body.weight_hoz:isset = false || (entry.event.metric = "weight" && @request.body.weight_hoz > 0)) &&',
    '(@request.body.length_q:isset = false || (entry.event.metric = "length" && @request.body.length_q > 0)) &&',
    "(",
    "  (entry.angler = @request.auth.id &&",
    '   status = "pending" &&',
    "   entry.withdrawn = false &&",
    '   entry.event.status = "live" &&',
    "   @now <= entry.event.submit_deadline &&",
    '   (@request.body.status:isset = false || @request.body.status = "retracted") &&',
    "   @request.body.reason:isset = false &&",
    "   @request.body.rev:isset = true &&",
    "   @request.body.rev = rev)",
    "  ||",
    "  (entry.angler != @request.auth.id &&",
    "   (entry.event.judge = @request.auth.id ||",
    "    (entry.event.backup_judge = @request.auth.id && entry.angler = entry.event.judge)) &&",
    '   (entry.event.status = "live" || entry.event.status = "closed") &&',
    '   status != "retracted" &&',
    "   @request.body.photo:isset = false &&",
    "   @request.body.photo_captured_at:isset = false &&",
    "   @request.body.rev:isset = true &&",
    "   @request.body.rev = rev &&",
    "   (@request.body.status:isset = true ||",
    "    @request.body.species:isset = true ||",
    "    @request.body.weight_hoz:isset = true ||",
    "    @request.body.length_q:isset = true) &&",
    "   (@request.body.status:isset = false ||",
    '    @request.body.status = "verified" || @request.body.status = "rejected") &&',
    '   (@request.body.status != "rejected" || @request.body.reason != "") &&',
    '   (@request.body.status != "rejected" ||',
    "    (@request.body.species:isset = false &&",
    "     @request.body.weight_hoz:isset = false &&",
    "     @request.body.length_q:isset = false)) &&",
    '   (status = "pending" ||',
    "    @request.body.status:isset = false ||",
    "    @request.body.status = status ||",
    '    @request.body.reason != ""))',
    ")",
  ].join("\n")
  app.save(catches)
})
