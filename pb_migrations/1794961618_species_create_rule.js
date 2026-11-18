/// <reference path="../pb_data/types.d.ts" />
// S4-finalize step 2: the organizer adds a species for future tournaments (R-SPC-C-01, C-02).
// The docs/security.md "species" Create rule. Update and delete stay null: a typo is renamed by
// the superuser, logged, and nothing is deleted (R-SPC-U-01, U-02, D-01).
// Forward-only: no down function (docs/dev-lifecycle-guide.md).
migrate((app) => {
  const species = app.findCollectionByNameOrId("species")
  species.createRule = '@request.auth.role = "organizer"'
  app.save(species)
})
