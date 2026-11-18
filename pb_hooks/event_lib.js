// Shared by the events hooks. goja: CommonJS only, no async/await, no Node or browser APIs.
// Hooks load it with require(`${__hooks}/event_lib.js`); not a *.pb.js file, so PocketBase does not
// run it as a hook by itself.

const DAY_MS = 24 * 3600 * 1000
const MINUTE_MS = 60 * 1000

// Every events field, as the audit snapshot holds it (docs/security.md "Audit snapshots": event
// rows carry every `events` field). The order is fixed so the audit CSV's columns are too.
const EVENT_FIELDS = [
  "name",
  "status",
  "starts_at",
  "ends_at",
  "deadline_ext_min",
  "submit_deadline",
  "metric",
  "best_n",
  "judge",
  "backup_judge",
  "species",
  "code_word_on",
  "code_word",
  "code_word_prev",
  "code_word_changed_at",
]

// A stored or sent date as ms since the epoch, or null when empty. Throws on a value that is not a date.
function dateMs(value) {
  if (value === null || value === undefined || value === "") return null
  const dt = new DateTime(String(value))
  if (dt.isZero()) throw new Error("not a date: " + value)
  return dt.time().unixMilli()
}

function isoOf(ms) {
  return new Date(ms).toISOString()
}

function eventSnapshot(record) {
  return {
    name: record.getString("name"),
    status: record.getString("status"),
    starts_at: record.getString("starts_at"),
    ends_at: record.getString("ends_at"),
    deadline_ext_min: record.getInt("deadline_ext_min"),
    submit_deadline: record.getString("submit_deadline"),
    metric: record.getString("metric"),
    best_n: record.getInt("best_n"),
    judge: record.getString("judge"),
    backup_judge: record.getString("backup_judge"),
    species: record.getStringSlice("species"),
    code_word_on: record.getBool("code_word_on"),
    code_word: record.getString("code_word"),
    code_word_prev: record.getString("code_word_prev"),
    code_word_changed_at: record.getString("code_word_changed_at"),
  }
}

// The names of the snapshot fields whose values differ between two snapshots.
function changedFields(before, after) {
  const changed = []
  for (let i = 0; i < EVENT_FIELDS.length; i++) {
    const field = EVENT_FIELDS[i]
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) changed.push(field)
  }
  return changed
}

// The final deadline: ends_at + 24 h + the outage extension, or "" while ends_at is unset (a draft
// may be saved incomplete).
function deadlineOf(endsAt, extMin) {
  const ends = dateMs(endsAt)
  if (ends === null) return ""
  return isoOf(ends + DAY_MS + (extMin || 0) * MINUTE_MS)
}

function refuse(field, code, message) {
  const errors = {}
  errors[field] = new ValidationError(code, message)
  return new BadRequestError(message, errors)
}

// The $app.store() key under which an automatic entry's join actor waits for the entries join
// hook (pb_hooks/entries_join.pb.js), which writes the one `join` row.
function joinActorKey(eventId, userId) {
  return "events.join_actor:" + eventId + ":" + userId
}

// Enters a user in the event if they have no entry yet (docs/security.md "Hook (events create)",
// R-EVT-C-08, U-17, U-19). The entries join hook sets display_name from their name and writes
// the one `join` row; its actor is the organizer who made the change ("" for the superuser), handed
// over through $app.store() because a model hook can't see who made the request. Saved with hooks
// on: with hooks off, v0.40.4 fills in neither the id nor the `created` autodate. Returns true when
// an entry was created.
function enterIfMissing(app, eventId, userId, actorId) {
  if (userId === "") return false
  try {
    app.findFirstRecordByFilter("entries", "event = {:event} && angler = {:angler}", { event: eventId, angler: userId })
    return false
  } catch (_) {
    // none yet
  }
  const entry = new Record(app.findCollectionByNameOrId("entries"))
  entry.set("event", eventId)
  entry.set("angler", userId)
  entry.set("withdrawn", false)
  const key = joinActorKey(eventId, userId)
  $app.store().set(key, actorId)
  try {
    app.save(entry)
  } finally {
    $app.store().remove(key)
  }
  return true
}

function auditEvent(app, actorId, action, eventId, before, after) {
  const audit = new Record(app.findCollectionByNameOrId("audit_log"))
  audit.set("actor", actorId)
  audit.set("action", action)
  audit.set("event", eventId)
  audit.set("target_id", eventId)
  audit.set("before", before)
  audit.set("after", after)
  app.save(audit)
}

function isOrganizer(app, userId) {
  if (userId === "") return false
  try {
    return app.findRecordById("users", userId).getString("role") === "organizer"
  } catch (_) {
    return false
  }
}

module.exports = {
  DAY_MS,
  EVENT_FIELDS,
  dateMs,
  isoOf,
  eventSnapshot,
  changedFields,
  deadlineOf,
  refuse,
  joinActorKey,
  enterIfMissing,
  auditEvent,
  isOrganizer,
}
