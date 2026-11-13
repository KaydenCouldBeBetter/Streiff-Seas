/// <reference path="../../../pb_data/types.d.ts" />
// SPIKE: the append-only check, before PocketBase saves or deletes anything.
onRecordUpdateRequest((e) => {
  require(`${__hooks}/photo_lib.js`).refuseDroppedPhoto(e)
  e.next()
}, "catches")
