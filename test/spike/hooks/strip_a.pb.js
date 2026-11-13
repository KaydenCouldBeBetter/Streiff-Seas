/// <reference path="../../../pb_data/types.d.ts" />
// SPIKE, Option A: clean every upload with an external command through $os.cmd, then save the
// cleaned bytes instead. The command comes from the test (placeholder below).
// MODE decides how the cleaned files replace the uploads; the spike tries them in turn.
onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/photo_lib.js`)
  const r = lib.stripUploads(e, __STRIP_CMD__)
  if (r.clean && r.clean.length > 0) e.record.set("photo", r.clean)
  e.next()
}, "catches")
onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/photo_lib.js`)
  const r = lib.stripUploads(e, __STRIP_CMD__)
  if (r.clean && r.clean.length > 0) {
    const now = e.record.get("photo")
    const kept = []
    for (let i = 0; i < now.length; i++) if (typeof now[i] === "string") kept.push(now[i])
    e.record.set("photo", kept.concat(r.clean))
  }
  e.next()
}, "catches")
