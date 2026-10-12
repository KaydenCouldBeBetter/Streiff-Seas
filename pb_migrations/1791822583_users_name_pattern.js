/// <reference path="../pb_data/types.d.ts" />
// users.name gets the pattern species.name has. `required` refuses only the empty string,
// so a name of one space still saved, and it is the member's board name.
// Forward-only: no down function (docs/dev-lifecycle-guide.md).
migrate((app) => {
  // One or more words with a single space between them: no name that is only spaces, and no
  // leading, trailing or doubled space. \p{Z} is every Unicode space.
  const users = app.findCollectionByNameOrId("users")
  users.fields.getByName("name").pattern = "^[^\\s\\p{Z}]+( [^\\s\\p{Z}]+)*$"
  app.save(users)
})
