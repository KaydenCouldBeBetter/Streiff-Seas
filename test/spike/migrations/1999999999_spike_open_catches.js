/// <reference path="../../../pb_data/types.d.ts" />
// SPIKE ONLY (M0-04). Never copied into pb_migrations/. test/spike/spike.ts copies the repo's
// migrations and this file into a throwaway directory, and puts the test's JSON config where
// `const cfg` is.
//
// It opens, for the spike's throwaway database only:
//   - catches create/update/view with just enough rule to ask the photo questions
//     (NOT the real security.md rules: no entry, event, window or server-only-field clauses);
//   - events create with the real security.md create rule, to ask whether `judge.role`
//     resolves against the submitted body.
migrate((app) => {
  const cfg = __SPIKE_CONFIG__

  const catches = app.findCollectionByNameOrId("catches")
  catches.createRule = '@request.auth.id != "" && @request.body.photo:length >= 2'
  catches.updateRule = '@request.auth.id != "" && @request.body.rev:isset = true && @request.body.rev = rev'
  catches.viewRule = '@request.auth.id != ""'
  catches.listRule = '@request.auth.id != ""'
  const photo = catches.fields.getByName("photo")
  photo.mimeTypes = cfg.mimes
  photo.thumbs = cfg.thumbs
  app.save(catches)

  const events = app.findCollectionByNameOrId("events")
  events.createRule =
    '@request.auth.role = "organizer" && ' +
    '@request.body.status = "draft" && ' +
    '@request.body.submit_deadline:isset = false && ' +
    '@request.body.deadline_ext_min:isset = false && ' +
    '@request.body.code_word_prev:isset = false && ' +
    '@request.body.code_word_changed_at:isset = false && ' +
    '@request.body.judge != @request.body.backup_judge && ' +
    'judge.role = "organizer"'
  app.save(events)
})
