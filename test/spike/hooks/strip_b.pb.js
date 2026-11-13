/// <reference path="../../../pb_data/types.d.ts" />
// SPIKE, Option B: fail closed. Refuse any upload that carries metadata (see photo_lib.js).
onRecordCreateRequest((e) => {
  require(`${__hooks}/photo_lib.js`).refuseMetadata(e)
  e.next()
}, "catches")
onRecordUpdateRequest((e) => {
  require(`${__hooks}/photo_lib.js`).refuseMetadata(e)
  e.next()
}, "catches")
