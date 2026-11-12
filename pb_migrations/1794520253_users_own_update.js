/// <reference path="../pb_data/types.d.ts" />
// Profile (PRF-01, R-USR-U-01 to U-07): a signed-in member may update their own users record,
// and nothing else of it than what the app sends (name, display_units). The rule itself refuses
// the fields only the superuser changes: role (changed), email and verified (present at all).
// Rules run before hooks, so this is the real gate (CLAUDE.md); the name pattern on the field
// (1791822583) still refuses blank and badly spaced names.
// Forward-only: no down function (docs/dev-lifecycle-guide.md).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.updateRule = [
    '@request.auth.id != ""',
    "id = @request.auth.id",
    "@request.body.role:changed = false",
    "@request.body.email:isset = false",
    "@request.body.verified:isset = false",
  ].join(" && ")
  app.save(users)
})
