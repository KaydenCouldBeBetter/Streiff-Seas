// Shared by the catches hooks. goja: CommonJS only, no async/await, no Node or browser APIs.
// Hooks load it with require(`${__hooks}/catch_lib.js`): a function declared at the top level
// of a *.pb.js file is not visible inside its handlers. Not a *.pb.js file, so PocketBase does
// not run it as a hook by itself.
//
// The photo pipeline is the M0-04 spike's result (docs/drafts/decisions-L2-photo-spike.md):
// exiftool `-all=` on every upload, then a scan of the cleaned bytes that refuses anything
// location-capable still in them. Fail closed: if exiftool is missing or fails, the photo is
// refused, never stored as sent.

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const DAY_MS = 24 * 3600 * 1000

function bytesOf(file) {
  const reader = file.reader.open()
  try {
    return toBytes(reader)
  } finally {
    reader.close()
  }
}

function ascii(bytes, from, to) {
  let out = ""
  for (let i = from; i < to && i < bytes.length; i++) out += String.fromCharCode(bytes[i])
  return out
}

// What a file still carries that could hold a location (the spike's Option B walker). Empty
// means clean. A JPEG APP1 (EXIF or XMP), APP13 (IPTC) or COM segment, data after the end
// marker, a PNG text or eXIf chunk, a HEIF file (not walkable here) or an unknown format all count.
function metadataFound(bytes) {
  const found = []
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2
    while (i + 4 <= bytes.length) {
      if (bytes[i] !== 0xff) break
      const marker = bytes[i + 1]
      if (marker === 0xda || marker === 0xd9) break // start of scan: image data follows
      if (marker === 0xff) { i++; continue }
      const length = bytes[i + 2] * 256 + bytes[i + 3]
      const head = ascii(bytes, i + 4, i + 4 + 30)
      if (marker === 0xe1 && head.indexOf("Exif") === 0) found.push("jpeg:exif")
      else if (marker === 0xe1 && head.indexOf("http://ns.adobe.com/xap") === 0) found.push("jpeg:xmp")
      else if (marker === 0xe1) found.push("jpeg:app1")
      else if (marker === 0xed) found.push("jpeg:app13-iptc")
      else if (marker === 0xfe) found.push("jpeg:comment")
      i += 2 + length
    }
    let end = bytes.length
    while (end > 2 && bytes[end - 1] === 0) end--
    if (!(bytes[end - 2] === 0xff && bytes[end - 1] === 0xd9)) found.push("jpeg:trailing-data")
    return found
  }
  if (bytes.length > 8 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG") {
    let i = 8
    while (i + 8 <= bytes.length) {
      const length = ((bytes[i] * 256 + bytes[i + 1]) * 256 + bytes[i + 2]) * 256 + bytes[i + 3]
      const type = ascii(bytes, i + 4, i + 8)
      if (type === "tEXt" || type === "zTXt" || type === "iTXt" || type === "eXIf") found.push("png:" + type)
      if (type === "IEND") break
      i += 12 + length
    }
    return found
  }
  if (bytes.length > 12 && ascii(bytes, 4, 8) === "ftyp") {
    found.push("heif:not-inspectable")
    return found
  }
  found.push("unknown-format")
  return found
}

function photoError(code, message) {
  return new BadRequestError(message, { photo: new ValidationError(code, message) })
}

// Strips every file with exiftool and returns the cleaned files, in order. Temp files live under
// pb_data, not /tmp: the prod unit runs with ProtectSystem=strict (spike, Q1). Throws a
// BadRequestError (field `photo`) on a file over the size limit, a failed strip, or anything
// location-capable left after the strip.
function stripPhotos(app, files) {
  const dir = app.dataDir() + "/.photo-strip"
  $os.mkdirAll(dir, 0o700)
  const clean = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (file.size > MAX_PHOTO_BYTES) throw photoError("photo_too_large", "Photo " + (i + 1) + " is over 5 MB.")
    const tmp = dir + "/" + $security.randomString(24) + ".bin"
    try {
      $os.writeFile(tmp, bytesOf(file), 0o600)
      try {
        $os.cmd("exiftool", "-all=", "-overwrite_original", "-q", tmp).combinedOutput()
      } catch (err) {
        // exiftool missing, or it could not parse the file: refuse, never store it as sent.
        throw photoError("photo_strip_failed", "Photo " + (i + 1) + " could not be cleaned.")
      }
      const cleaned = toBytes($os.readFile(tmp))
      const left = metadataFound(cleaned)
      if (left.length > 0) throw photoError("photo_has_metadata", "Photo " + (i + 1) + " still carries metadata: " + left.join(", "))
      clean.push($filesystem.fileFromBytes(cleaned, file.originalName))
    } finally {
      try { $os.remove(tmp) } catch (_) {}
    }
  }
  return clean
}

// A stored or sent date as ms since the epoch, or null when empty. Throws on a value that is
// not a date.
function dateMs(value) {
  if (value === null || value === undefined || value === "") return null
  const dt = new DateTime(String(value))
  if (dt.isZero()) throw new Error("not a date: " + value)
  return dt.time().unixMilli()
}

// photo_captured_at as a JS array, whatever form the record holds it in ([] when empty).
function capturedList(record) {
  const raw = record.getString("photo_captured_at")
  if (raw === "" || raw === "null") return []
  const parsed = JSON.parse(raw)
  return Array.isArray(parsed) ? parsed : null
}

// The create-time flag codes (docs/security.md "Flag codes"), in the table's order. Times in ms;
// `photoTimes` is one entry per photo (null for none), the first being `captured`.
function createFlags(captured, photoTimes, startsAt, endsAt, receivedAt) {
  const flags = []
  if (captured === null) {
    flags.push("no_capture_time")
  } else {
    if (startsAt !== null && captured < startsAt) flags.push("before_window")
    if (endsAt !== null && captured > endsAt) flags.push("after_window")
    if (receivedAt - captured > DAY_MS) flags.push("late_submit")
  }
  let noTime = false
  let far = false
  for (let i = 1; i < photoTimes.length; i++) {
    const t = photoTimes[i]
    if (t === null) noTime = true
    else if (captured !== null && Math.abs(t - captured) > DAY_MS) far = true
  }
  if (noTime) flags.push("extra_photo_no_time")
  if (far) flags.push("extra_photo_far")
  return flags
}

// The flags after an angler adds photos (security.md "Flag codes"): the stored codes, plus
// photo_added, plus per added photo extra_photo_no_time (no time) or extra_photo_far (more than
// 24 h from captured_at, only when both exist). Codes are only ever added, never removed.
function addedPhotoFlags(current, captured, addedTimes) {
  const flags = (current || []).slice()
  const add = (code) => {
    if (flags.indexOf(code) < 0) flags.push(code)
  }
  add("photo_added")
  for (let i = 0; i < addedTimes.length; i++) {
    const t = addedTimes[i]
    if (t === null) add("extra_photo_no_time")
    else if (captured !== null && Math.abs(t - captured) > DAY_MS) add("extra_photo_far")
  }
  return flags
}

// The fixed catch snapshot every audit row holds (docs/security.md "Audit snapshots").
function catchSnapshot(record) {
  return {
    species: record.getString("species"),
    weight_hoz: record.getInt("weight_hoz"),
    length_q: record.getInt("length_q"),
    status: record.getString("status"),
    reason: record.getString("reason"),
    photo: record.getStringSlice("photo"),
    photo_captured_at: capturedList(record),
    flags: JSON.parse(record.getString("flags") || "[]") || [],
    rev: record.getInt("rev"),
  }
}

module.exports = {
  MAX_PHOTO_BYTES,
  metadataFound,
  stripPhotos,
  dateMs,
  capturedList,
  createFlags,
  addedPhotoFlags,
  catchSnapshot,
}
