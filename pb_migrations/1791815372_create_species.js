/// <reference path="../pb_data/types.d.ts" />
// species: the fish a tournament can allow. Every API rule is null (superuser only) until
// a later item opens it with its docs/security.md row and test.
// Forward-only: no down function (docs/dev-lifecycle-guide.md).
migrate((app) => {
  const collection = new Collection({
    type: "base",
    name: "species",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "name", type: "text", required: true, max: 60 },
    ],
    indexes: [
      // NOCASE: names that differ only in case are duplicates (R-SPC-C-03).
      "CREATE UNIQUE INDEX `idx_species_name` ON `species` (`name` COLLATE NOCASE)",
    ],
  })

  app.save(collection)
})
