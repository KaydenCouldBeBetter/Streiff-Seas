/// <reference path="../pb_data/types.d.ts" />
// The two species of the first tournament. The organizer adds others in the app.
// Forward-only: no down function.
migrate((app) => {
  const species = app.findCollectionByNameOrId("species")

  for (const name of ["largemouth bass", "smallmouth bass"]) {
    const record = new Record(species)
    record.set("name", name)
    app.save(record)
  }
})
