/// <reference path="../pb_data/types.d.ts" />
// Event update (docs/security.md "Hook (events update)"; R-EVT-U-04, U-06 to U-13, U-15 to U-17,
// U-19 to U-27, U-29, R-AUD-H-03, H-05). Runs in goja: CommonJS only, no async/await.
//
// On v0.40.4 an update rule is checked before onRecordUpdateRequest runs (test/entries.test.ts pins
// it), so an organizer's request that gets here has passed the events update rule: never final,
// no hook-set field in the body, the extension only while live, the live locks and the closed
// locks. What's left is the hook's: the lifecycle, the Open checklist, the deadline and extension,
// the later-only ends_at, the judge checks, the code word history, the automatic entries and
// exactly one audit row per change.
//
// The save, any automatic entries and the audit row run in one transaction (e.app swapped for the
// transaction's app), so they land together or not at all.
//
// The superuser (the test world, the admin UI) is checked only when it changes the judge or the
// backup judge: that is the judge step-down (R-EVT-U-19). Any other superuser change passes through
// unchecked and unaudited, as a break-glass edit logged in ops.md section 12 (decisions.md
// 2026-11-17, S4 backend calls).
onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth() && !e.auth) return e.next()

  const lib = require(`${__hooks}/event_lib.js`)
  const record = e.record
  const original = record.original()
  const before = lib.eventSnapshot(original)
  const judge = record.getString("judge")
  const backup = record.getString("backup_judge")
  const judgeChanged = judge !== before.judge
  const backupChanged = backup !== before.backup_judge

  if (e.hasSuperuserAuth()) {
    if (!judgeChanged && !backupChanged) return e.next()
    if (judge === backup) throw lib.refuse("backup_judge", "judge_is_backup", "The judge and the backup judge must be different people.")
    // The step-down: the person who was backup judge before this request becomes the judge, and
    // needn't be an organizer (R-EVT-U-19; decisions.md 2026-10-05). Anyone else must be one.
    if (judgeChanged && judge !== before.backup_judge && !lib.isOrganizer(e.app, judge)) {
      throw lib.refuse("judge", "judge_not_organizer", "The judge must be an organizer, unless the backup judge is stepping up.")
    }
    e.app.runInTransaction((txApp) => {
      e.app = txApp
      e.next()
      const status = record.getString("status")
      if (status === "draft" || status === "live") {
        if (judgeChanged) lib.enterIfMissing(txApp, record.id, judge, "")
        if (backupChanged) lib.enterIfMissing(txApp, record.id, backup, "")
      }
      // The superuser's audit rows have an empty actor (decisions.md 2026-10-12).
      lib.auditEvent(txApp, "", "event_edit", record.id, before, lib.eventSnapshot(record))
    })
    return
  }

  const actor = e.auth.id
  const was = before.status
  const now = Date.now()

  // Hook-set fields first, so the comparison below sees exactly what would be saved. The deadline
  // is recomputed only when one of its inputs changes, so a status step never moves it.
  const ext = record.getInt("deadline_ext_min")
  if (record.getString("ends_at") !== before.ends_at || ext !== before.deadline_ext_min) {
    record.set("submit_deadline", lib.deadlineOf(record.getString("ends_at"), ext))
  }

  const draft = lib.eventSnapshot(record)
  const changed = lib.changedFields(before, draft)
  if (changed.length === 0) throw lib.refuse("status", "nothing_changed", "Nothing to change.")

  const status = draft.status
  if (status !== was) {
    const next = { draft: "live", live: "closed", closed: "final" }
    if (next[was] !== status) {
      throw lib.refuse("status", "status_step", "A tournament moves one step at a time: draft, live, closed, final.")
    }
    // One step per request, so each gets exactly one open, close or finalize row (decisions.md
    // 2026-11-17, S4 backend calls).
    if (changed.length !== 1) throw lib.refuse("status", "status_alone", "Change the status on its own.")

    if (status === "live") {
      // The Open checklist (R-EVT-U-25; decisions.md 2026-10-05 "What a draft needs before Open").
      const missing = []
      const starts = lib.dateMs(draft.starts_at)
      const ends = lib.dateMs(draft.ends_at)
      if (starts === null || ends === null || starts >= ends) missing.push("window")
      if (draft.species.length === 0) missing.push("species")
      if (draft.backup_judge === "" || draft.backup_judge === draft.judge) missing.push("backup_judge")
      if (draft.code_word_on && draft.code_word.trim() === "") missing.push("code_word")
      if (missing.length > 0) {
        throw lib.refuse("status", "open_incomplete", "This draft can't open yet: " + missing.join(", ") + ".")
      }
    } else if (status === "closed") {
      // Closing is refused before the final deadline, by the server's clock (R-EVT-U-07).
      const due = lib.dateMs(before.submit_deadline)
      if (due === null || now < due) throw lib.refuse("status", "close_too_early", "The final deadline hasn't passed yet.")
    } else if (status === "final") {
      // Finalize is refused while any catch is pending; retracted ones don't count (R-EVT-U-08).
      const pending = e.app.findRecordsByFilter("catches", 'entry.event = {:event} && status = "pending"', "", 1, 0, { event: record.id })
      if (pending.length > 0) throw lib.refuse("status", "finalize_pending", "Every pending catch must be judged first.")
    }
  } else {
    // The outage extension only grows, in whole hours (R-EVT-U-13, U-15; decisions.md 2026-10-01).
    // The rule already limits it to a live event (R-EVT-U-14).
    if (ext !== before.deadline_ext_min) {
      if (ext < before.deadline_ext_min) throw lib.refuse("deadline_ext_min", "ext_lower", "The extension can only grow.")
      if (ext % 60 !== 0) throw lib.refuse("deadline_ext_min", "ext_not_hours", "The extension is set in whole hours.")
    }

    // While live, ends_at moves later only, and only while the window is open (R-EVT-U-21, U-22;
    // decisions.md 2026-10-05). On a draft it may change freely (R-EVT-U-01); once closed the rule
    // refuses it.
    if (was === "live" && draft.ends_at !== before.ends_at) {
      const stored = lib.dateMs(before.ends_at)
      const sent = lib.dateMs(draft.ends_at)
      if (stored !== null && now > stored) {
        throw lib.refuse("ends_at", "ends_at_window_closed", "The fishing window has closed; its end can't move now.")
      }
      if (sent === null || (stored !== null && sent < stored)) {
        throw lib.refuse("ends_at", "ends_at_earlier", "The window's end can only move later.")
      }
    }

    if (judgeChanged || backupChanged) {
      if (judge === backup) throw lib.refuse("backup_judge", "judge_is_backup", "The judge and the backup judge must be different people.")
      // R-EVT-U-16 on a draft; the rule already locks judge once live (R-EVT-U-18).
      if (judgeChanged && !lib.isOrganizer(e.app, judge)) throw lib.refuse("judge", "judge_not_organizer", "The judge must be an organizer.")
      // Without a backup judge the judge's own catches can't be judged and Finalize stays blocked
      // (decisions.md 2026-11-17, S4 backend calls).
      if (was !== "draft" && backup === "") throw lib.refuse("backup_judge", "backup_required", "A tournament past draft needs a backup judge.")
    }

    // The code word history on a live event (R-EVT-U-27, U-29; decisions.md 2026-10-05).
    if (was === "live" && draft.code_word !== before.code_word) {
      record.set("code_word_prev", before.code_word)
      record.set("code_word_changed_at", lib.isoOf(now))
    }
  }

  const action = status === was ? "event_edit" : { live: "open", closed: "close", final: "finalize" }[status]

  e.app.runInTransaction((txApp) => {
    e.app = txApp
    e.next()
    // A new judge or backup judge fishes too, unless the event is already closed (R-EVT-U-17, U-23).
    if (status === "draft" || status === "live") {
      if (judgeChanged) lib.enterIfMissing(txApp, record.id, judge, actor)
      if (backupChanged) lib.enterIfMissing(txApp, record.id, backup, actor)
    }
    lib.auditEvent(txApp, actor, action, record.id, before, lib.eventSnapshot(record))
  })
}, "events")
