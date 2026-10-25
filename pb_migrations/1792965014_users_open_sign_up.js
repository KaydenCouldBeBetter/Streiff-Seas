/// <reference path="../pb_data/types.d.ts" />
// Open self sign-up (decisions.md 2026-10-25): anyone not signed in may create their own
// users record, as a member. The rule itself refuses the fields only the superuser sets
// (role other than member, verified, emailVisibility); signed-in callers still can't create.
// Cloudflare Access's email list still decides who reaches the page at all.
// Forward-only: no down function (docs/dev-lifecycle-guide.md).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.createRule = [
    '@request.auth.id = ""',
    '@request.body.role = "member"',
    "@request.body.verified:isset = false",
    "@request.body.emailVisibility:isset = false",
  ].join(" && ")
  app.save(users)
})
