/// <reference path="../pb_data/types.d.ts" />
// S1-submit, decisions.md Open item 19 (R-USR-U-08): a member may no longer send their own
// emailVisibility. The create rule already refuses it (R-USR-C-06); the update rule of
// 1794520253_users_own_update.js didn't. It matters once organizers can read every users record
// (the users list and view rule, next migration): a visible email would show to them. The other
// clauses are 1794520253's, unchanged and in the same one-line form.
// Forward-only: no down function (docs/dev-lifecycle-guide.md).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.updateRule = [
    '@request.auth.id != ""',
    "id = @request.auth.id",
    "@request.body.role:changed = false",
    "@request.body.email:isset = false",
    "@request.body.verified:isset = false",
    "@request.body.emailVisibility:isset = false",
  ].join(" && ")
  app.save(users)
})
