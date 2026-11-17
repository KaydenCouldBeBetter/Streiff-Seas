/// <reference path="../pb_data/types.d.ts" />
// S1-submit (R-USR-L-01 to L-03, R-USR-V-01, V-02): a signed-in member reads only their own users
// record; an organizer reads every one (to pick judges, ORG-02a, and name who withdrew an angler,
// ORG-08a). The rule is the docs/security.md "users" List / view block line for line;
// test/rules.test.ts compares the stored text with the doc. View = list. Emails stay hidden from
// organizers: PocketBase shows one only to its owner or when emailVisibility is on, which nobody
// but the superuser can set (R-USR-C-06, R-USR-U-08, 1794843182). Create, update and delete are
// unchanged.
// Forward-only: no down function (docs/dev-lifecycle-guide.md).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  const rule = ['@request.auth.id != "" &&', '(id = @request.auth.id || @request.auth.role = "organizer")'].join("\n")
  users.listRule = rule
  users.viewRule = rule
  app.save(users)
})
