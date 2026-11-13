/// <reference path="../../../pb_data/types.d.ts" />
// SPIKE: lets a test ask what a catches update hook can see, and which hooks run in a transaction.
// Everything is inside the handlers: a top-level function in a *.pb.js file is not visible there
// (ReferenceError at run time on v0.40.4).
//
// `probe=1` in the body: answer with what the request hook sees, and save nothing.
// An update that sets weight_hoz to 71: the save runs, each hook records isTransactional(), and the
// last one refuses with the list in the message.
onRecordUpdateRequest((e) => {
  const body = e.requestInfo().body
  if (String(body.probe) === "1") {
    const unsaved = e.record.getUnsavedFiles("photo")
    const names = []
    for (let i = 0; i < unsaved.length; i++) names.push(unsaved[i].name + " <" + unsaved[i].originalName + ">")
    const now = e.record.get("photo")
    const shown = []
    for (let i = 0; i < now.length; i++) shown.push(typeof now[i] === "string" ? now[i] : "(new file " + now[i].originalName + ")")
    return e.json(200, { now: shown, unsaved: names, original: e.record.original().get("photo") })
  }
  if (e.record.getInt("weight_hoz") === 71) e.set("tx_request", e.app.isTransactional())
  e.next()
}, "catches")

onRecordUpdate((e) => {
  $app.store().set("tx_update", e.app.isTransactional())
  e.next()
}, "catches")

onRecordUpdateExecute((e) => {
  const seen = "onRecordUpdate=" + $app.store().get("tx_update") + " onRecordUpdateExecute=" + e.app.isTransactional()
  e.next()
  $app.store().set("tx_seen", seen)
}, "catches")

onRecordAfterUpdateSuccess((e) => {
  e.next()
  if (e.record.getInt("weight_hoz") === 71) {
    throw new BadRequestError("TX " + $app.store().get("tx_seen") + " onRecordAfterUpdateSuccess=" + e.app.isTransactional())
  }
}, "catches")
