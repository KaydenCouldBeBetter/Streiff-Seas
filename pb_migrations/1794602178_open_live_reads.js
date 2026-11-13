/// <reference path="../pb_data/types.d.ts" />
// M0-03 live skeleton: members read events, entries, catches and species, exactly as
// docs/security.md writes the list / view rules (v0.9 text, unchanged since). Each rule is the
// security.md code block line for line, so test/rules.test.ts can compare the stored text with
// the doc. View = list for all four. Every create, update and delete rule stays as it was.
// Species is opened here too (Kayden's call, 2026-11-13): the live list names each catch's species.
// Forward-only: no down function (docs/dev-lifecycle-guide.md).
migrate((app) => {
  const rules = {
    // R-EVT-L-01 to L-03, R-EVT-V-01
    events: [
      '@request.auth.id != "" &&',
      '(status != "draft" || @request.auth.role = "organizer")',
    ],
    // R-ENT-L-01 to L-06
    entries: [
      '@request.auth.id != "" &&',
      'event.status != "draft" &&',
      "(withdrawn = false ||",
      " angler = @request.auth.id ||",
      " event.judge = @request.auth.id ||",
      " (event.backup_judge = @request.auth.id && angler = event.judge) ||",
      ' @request.auth.role = "organizer")',
    ],
    // R-CAT-L-01 to L-08, L-10 to L-12, R-CAT-V-01
    catches: [
      '@request.auth.id != "" &&',
      "(",
      '  (status != "rejected" && status != "retracted" && entry.withdrawn = false) ||',
      "  entry.angler = @request.auth.id ||",
      "  entry.event.judge = @request.auth.id ||",
      "  (entry.event.backup_judge = @request.auth.id && entry.angler = entry.event.judge) ||",
      '  @request.auth.role = "organizer"',
      ")",
    ],
    // R-SPC-L-01 to L-03
    species: ['@request.auth.id != ""'],
  }

  for (const name of Object.keys(rules)) {
    const collection = app.findCollectionByNameOrId(name)
    const rule = rules[name].join("\n")
    collection.listRule = rule
    collection.viewRule = rule
    app.save(collection)
  }
})
