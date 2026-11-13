// Shared by the spike hooks (goja: CommonJS only; hooks load it with require(`${__hooks}/photo_lib.js`)).
// Top-level functions in a *.pb.js file are not visible inside its handlers, hence this module.

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

// Option B's check. Fail closed: a file is refused if it carries ANY metadata container that
// can hold a location, whether or not a GPS tag is actually in it, and a format that can't be
// walked here (HEIF) is refused outright. Returns the reasons; empty means clean.
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
    // Anything after the end-of-image marker is unexamined data: refuse it (fail closed).
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

module.exports = { bytesOf, metadataFound, ascii }

// Option B: refuse the request, naming the file, if any uploaded photo carries metadata.
function refuseMetadata(e) {
  const files = e.record.getUnsavedFiles("photo")
  for (let i = 0; i < files.length; i++) {
    const found = metadataFound(bytesOf(files[i]))
    if (found.length > 0) {
      throw new BadRequestError("A photo still carries location-capable metadata.", {
        photo: new ValidationError("photo_has_metadata", files[i].originalName + ": " + found.join(", ")),
      })
    }
  }
}

// Append-only: the new list must start with every stored name, in order (security.md "Hook
// (catches update)"). Runs before e.next(), so a refused request has saved and deleted nothing.
function refuseDroppedPhoto(e) {
  const before = e.record.original().get("photo")
  const now = e.record.get("photo")
  for (let i = 0; i < before.length; i++) {
    if (now[i] !== before[i]) {
      throw new BadRequestError("Photos can only be added, never removed or replaced.", {
        photo: new ValidationError("photo_append_only", "position " + (i + 1) + " is " + (typeof now[i] === "string" ? now[i] : "(new file or missing)") + ", stored is " + before[i]),
      })
    }
  }
}

module.exports.refuseMetadata = refuseMetadata
module.exports.refuseDroppedPhoto = refuseDroppedPhoto

// Option A: run the strip command on every uploaded photo and swap the cleaned bytes in for the
// upload, before anything is saved. `cmd` is the argv with "{file}" where the temp file goes,
// e.g. ["exiftool", "-all=", "-overwrite_original", "{file}"]. Any failure refuses the request
// (fail closed). Returns a description of what it did, for the evidence.
function stripUploads(e, cmd) {
  const files = e.record.getUnsavedFiles("photo")
  if (files.length === 0) return []
  const clean = []
  const log = []
  for (let i = 0; i < files.length; i++) {
    const tmp = $os.tempDir() + "/spike-strip-" + $security.randomString(12) + ".bin"
    try {
      const bytes = bytesOf(files[i])
      $os.writeFile(tmp, bytes, 0o600)
      const argv = []
      for (let j = 0; j < cmd.length; j++) argv.push(cmd[j] === "{file}" ? tmp : cmd[j])
      let output
      try {
        output = toString($os.cmd.apply(null, argv).combinedOutput())
      } catch (err) {
        throw new BadRequestError("Photo could not be cleaned.", { photo: new ValidationError("photo_strip_failed", files[i].originalName + ": " + err) })
      }
      const cleaned = toBytes($os.readFile(tmp))
      clean.push($filesystem.fileFromBytes(cleaned, files[i].originalName))
      log.push(files[i].originalName + ": " + bytes.length + " -> " + cleaned.length + " bytes; " + output.replace(/\s+/g, " ").trim())
    } finally {
      try { $os.remove(tmp) } catch (_) {}
    }
  }
  return { clean: clean, log: log }
}
module.exports.stripUploads = stripUploads
