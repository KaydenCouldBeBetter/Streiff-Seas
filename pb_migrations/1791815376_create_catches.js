/// <reference path="../pb_data/types.d.ts" />
// catches: one fish on one entry. Every API rule is null until a later item opens it.
// status, judged_by, reason, flags and rev are server-only; the rules and hooks that guard
// them come with S1.
// Forward-only: no down function.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  const species = app.findCollectionByNameOrId("species")
  const entries = app.findCollectionByNameOrId("entries")

  const collection = new Collection({
    type: "base",
    name: "catches",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "entry", type: "relation", required: true, collectionId: entries.id, maxSelect: 1, cascadeDelete: false },
      { name: "species", type: "relation", required: true, collectionId: species.id, maxSelect: 1, cascadeDelete: false },
      { name: "weight_hoz", type: "number", onlyInt: true, min: 0 },
      { name: "length_q", type: "number", onlyInt: true, min: 0 },
      // Protected: a bare file URL needs a file token. At most 4 JPEGs of 5 MB each; the
      // minimum of 2 is S1's rule and hook.
      {
        name: "photo",
        type: "file",
        protected: true,
        maxSelect: 4,
        maxSize: 5242880,
        mimeTypes: ["image/jpeg"],
        thumbs: [],
      },
      { name: "captured_at", type: "date" },
      { name: "photo_captured_at", type: "json" },
      { name: "client_uuid", type: "text", required: true, max: 64 },
      { name: "rev", type: "number", onlyInt: true, min: 0 },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["pending", "verified", "rejected", "retracted"] },
      { name: "judged_by", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "reason", type: "text", max: 500 },
      { name: "flags", type: "json" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX `idx_catches_client_uuid` ON `catches` (`client_uuid`)",
    ],
  })

  app.save(collection)
})
