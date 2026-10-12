/// <reference path="../pb_data/types.d.ts" />
// audit_log: one row per catch, entry or event change, written only by hooks (later items).
// Every API rule is null and stays null for create, update and delete.
// Forward-only: no down function.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  const events = app.findCollectionByNameOrId("events")
  const catches = app.findCollectionByNameOrId("catches")

  const collection = new Collection({
    type: "base",
    name: "audit_log",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      // Not required: the superuser isn't a users record, so an empty actor means the
      // superuser (the judge step-down, R-EVT-U-19).
      { name: "actor", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      {
        name: "action",
        type: "select",
        required: true,
        maxSelect: 1,
        values: [
          "join", "withdraw", "rejoin",
          "create", "edit", "retract", "approve", "reject", "correct",
          "open", "close", "finalize", "event_edit",
        ],
      },
      { name: "event", type: "relation", required: true, collectionId: events.id, maxSelect: 1, cascadeDelete: false },
      // Empty for event and entry rows.
      { name: "catch", type: "relation", collectionId: catches.id, maxSelect: 1, cascadeDelete: false },
      { name: "target_id", type: "text", required: true, max: 64 },
      { name: "before", type: "json" },
      { name: "after", type: "json" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
  })

  app.save(collection)
})
