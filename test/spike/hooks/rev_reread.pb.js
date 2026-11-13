/// <reference path="../../../pb_data/types.d.ts" />
// SPIKE (R-CAT-U-40): keeping two photo adds with the same `rev` from both landing.
// The update rule checks `@request.body.rev = rev`, but that is before the save, so two requests
// can pass it together. MODE (replaced by the test) picks what the hook does about it:
//   none      nothing (control)
//   reread    re-read rev in onRecordUpdate with e.app, as security.md says. v0.40.4 does NOT run
//             that hook in a transaction (isTransactional() is false), so this is the claim under test
//   cas       in onRecordUpdateExecute, one atomic `UPDATE ... SET rev = rev + 1 WHERE id AND rev = echoed`;
//             0 rows changed means somebody else got there first, so refuse
//   tx        in onRecordUpdateRequest, run the check and the save inside e.app.runInTransaction
//             with txApp.save(), and answer the request ourselves instead of calling e.next()
onRecordUpdateRequest((e) => {
  // Test aid: widen the gap between the rule check (already passed) and the save so two
  // requests are certain to be in it together.
  const ms = Number(e.requestInfo().body.delay_ms || 0)
  if (ms > 0) sleep(ms)

  if ("__REV_MODE__" === "tx") {
    const echoed = e.record.getInt("rev")
    e.app.runInTransaction((txApp) => {
      const stored = txApp.findRecordById("catches", e.record.id).getInt("rev")
      if (stored !== echoed) {
        throw new BadRequestError("The catch changed since you loaded it.", { rev: new ValidationError("rev_stale", "sent " + echoed + ", stored " + stored) })
      }
      e.record.set("rev", echoed + 1)
      txApp.save(e.record)
    })
    return e.json(200, e.record)
  }
  e.next()
}, "catches")

onRecordUpdate((e) => {
  if ("__REV_MODE__" !== "reread") return e.next()
  const echoed = e.record.getInt("rev")
  const stored = e.app.findRecordById("catches", e.record.id).getInt("rev")
  if (echoed !== stored) {
    throw new BadRequestError("The catch changed since you loaded it.", { rev: new ValidationError("rev_stale", "sent " + echoed + ", stored " + stored) })
  }
  e.record.set("rev", echoed + 1)
  e.next()
}, "catches")

onRecordUpdateExecute((e) => {
  if ("__REV_MODE__" !== "cas") return e.next()
  const echoed = e.record.original().getInt("rev") // what the record held when this request loaded it
  const sent = e.record.getInt("rev")
  const res = $app.db().newQuery("UPDATE catches SET rev = rev + 1 WHERE id = {:id} AND rev = {:rev}").bind({ id: e.record.id, rev: sent }).execute()
  if (res.rowsAffected() !== 1) {
    throw new BadRequestError("The catch changed since you loaded it.", { rev: new ValidationError("rev_stale", "sent " + sent + ", loaded " + echoed) })
  }
  e.record.set("rev", sent + 1)
  e.next()
}, "catches")
