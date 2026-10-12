/// <reference path="../pb_data/types.d.ts" />
// events: one tournament. Every API rule is null until a later item opens it.
// submit_deadline, code_word_prev and code_word_changed_at are set by hooks (later items).
// No relation cascades: nothing in this app is deleted (SPEC invariant 6).
// Forward-only: no down function.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  const species = app.findCollectionByNameOrId("species")

  const collection = new Collection({
    type: "base",
    name: "events",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "name", type: "text", required: true, max: 120 },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["draft", "live", "closed", "final"] },
      // A draft can be saved incomplete; the Open hook is what refuses one.
      { name: "starts_at", type: "date" },
      { name: "ends_at", type: "date" },
      // Not required, so an omitted value is stored as 0.
      { name: "deadline_ext_min", type: "number", onlyInt: true, min: 0 },
      { name: "submit_deadline", type: "date" },
      { name: "metric", type: "select", required: true, maxSelect: 1, values: ["weight", "length"] },
      { name: "best_n", type: "number", required: true, onlyInt: true, min: 1 },
      { name: "judge", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "backup_judge", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "species", type: "relation", collectionId: species.id, maxSelect: 50, cascadeDelete: false },
      { name: "code_word_on", type: "bool" },
      { name: "code_word", type: "text", max: 40 },
      { name: "code_word_prev", type: "text", max: 40 },
      { name: "code_word_changed_at", type: "date" },
    ],
  })

  app.save(collection)
})
