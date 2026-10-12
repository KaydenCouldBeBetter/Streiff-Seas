/// <reference path="../pb_data/types.d.ts" />
// users.name becomes required and species.name gets a pattern, so neither can be saved blank.
// Both are field options: they hold for the superuser and the admin UI too.
// Forward-only: no down function (docs/dev-lifecycle-guide.md).
migrate((app) => {
  // A member's name is their board name (decisions.md 2026-10-05, "No blank names on the
  // board"): not by invite, and not by a member clearing it in Profile.
  const users = app.findCollectionByNameOrId("users")
  users.fields.getByName("name").required = true
  app.save(users)

  // One or more words with a single space between them: no empty name, and no leading,
  // trailing or doubled space, which the unique index would take for a new species
  // (R-SPC-C-03). \p{Z} is every Unicode space, so a no-break space can't stand in for one.
  const species = app.findCollectionByNameOrId("species")
  species.fields.getByName("name").pattern = "^[^\\s\\p{Z}]+( [^\\s\\p{Z}]+)*$"
  app.save(species)
})
