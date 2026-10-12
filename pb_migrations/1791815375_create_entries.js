/// <reference path="../pb_data/types.d.ts" />
// entries: one angler in one tournament. Every API rule is null until a later item opens it.
// display_name and withdrawn_by are set by hooks (later items).
// Forward-only: no down function.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  const events = app.findCollectionByNameOrId("events")

  const collection = new Collection({
    type: "base",
    name: "entries",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "event", type: "relation", required: true, collectionId: events.id, maxSelect: 1, cascadeDelete: false },
      { name: "angler", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "display_name", type: "text", max: 255 },
      { name: "withdrawn", type: "bool" },
      { name: "withdraw_reason", type: "text", max: 500 },
      { name: "withdrawn_by", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: [
      "CREATE UNIQUE INDEX `idx_entries_event_angler` ON `entries` (`event`, `angler`)",
    ],
  })

  app.save(collection)
})
