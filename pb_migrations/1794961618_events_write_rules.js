/// <reference path="../pb_data/types.d.ts" />
// S4-finalize steps 1 to 5: the organizer creates and edits tournaments (R-EVT-C-01 to C-10,
// R-EVT-U-01 to U-29). Both rules are the docs/security.md "events" Create and Update blocks line
// for line. pb_hooks/events_create.pb.js enters the judge and backup judge; events_update.pb.js
// enforces the lifecycle, the Open checklist, the deadline and extension, the code word history
// and the judge step-down, and writes the audit rows. deleteRule stays null (R-EVT-D-01).
// Forward-only: no down function (docs/dev-lifecycle-guide.md).
migrate((app) => {
  const events = app.findCollectionByNameOrId("events")
  events.createRule = [
    '@request.auth.role = "organizer" &&',
    '@request.body.status = "draft" &&',
    "@request.body.submit_deadline:isset = false &&",
    "@request.body.deadline_ext_min:isset = false &&",
    "@request.body.code_word_prev:isset = false &&",
    "@request.body.code_word_changed_at:isset = false &&",
    "@request.body.judge != @request.body.backup_judge &&",
    'judge.role = "organizer"',
  ].join("\n")
  events.updateRule = [
    '@request.auth.role = "organizer" &&',
    'status != "final" &&',
    "@request.body.submit_deadline:isset = false &&",
    '(@request.body.deadline_ext_min:isset = false || status = "live") &&',
    "@request.body.code_word_prev:isset = false &&",
    "@request.body.code_word_changed_at:isset = false &&",
    '(status = "draft" || (',
    "  @request.body.metric:changed = false &&",
    "  @request.body.best_n:changed = false &&",
    "  @request.body.species:changed = false &&",
    "  @request.body.starts_at:changed = false &&",
    "  @request.body.judge:changed = false",
    ")) &&",
    '(status != "closed" || (',
    "  @request.body.name:changed = false &&",
    "  @request.body.code_word_on:changed = false &&",
    "  @request.body.code_word:changed = false &&",
    "  @request.body.ends_at:changed = false",
    "))",
  ].join("\n")
  app.save(events)
})
