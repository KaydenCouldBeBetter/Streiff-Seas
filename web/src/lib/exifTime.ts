// A photo's capture time, read from the file as picked, before the re-encode drops it
// (decisions.md L2 step 1, "Client read"; screens.md SUB-01a). Pure: bytes in, Date out. It is a
// signal only (SPEC invariant 9): a missing or odd value means null, and the server flags the
// catch `no_capture_time` instead of refusing it.
//
// Reads EXIF DateTimeOriginal (0x9003) and, when present, OffsetTimeOriginal (0x9011). Without an
// offset the time is read as the phone's local time, which is this browser's (a library photo
// is picked on the phone that took it). A live camera shot on iPhone has no DateTimeOriginal
// (M0-04 spike), so it comes back null.

const SOI = 0xffd8;
const APP1 = 0xe1;
const SOS = 0xda;
const EOI = 0xd9;

function ascii(view: DataView, from: number, length: number): string {
  let out = "";
  for (let i = from; i < from + length && i < view.byteLength; i += 1) out += String.fromCharCode(view.getUint8(i));
  return out;
}

/** DateTimeOriginal and OffsetTimeOriginal from one TIFF block (the EXIF payload) at `start`. */
function readTiff(view: DataView, start: number): { original: string | null; offset: string | null } {
  const none = { original: null, offset: null };
  if (start + 8 > view.byteLength) return none;
  const order = ascii(view, start, 2);
  const le = order === "II";
  if (!le && order !== "MM") return none;
  if (view.getUint16(start + 2, le) !== 42) return none;

  const text = (entry: number): string => {
    const count = view.getUint32(entry + 4, le);
    const at = count > 4 ? start + view.getUint32(entry + 8, le) : entry + 8;
    return ascii(view, at, count).replace(/\0+$/, "");
  };
  const walk = (offset: number, visit: (tag: number, entry: number) => void): void => {
    const at = start + offset;
    if (at + 2 > view.byteLength) return;
    const count = view.getUint16(at, le);
    if (count > 500) return;
    for (let i = 0; i < count; i += 1) {
      const entry = at + 2 + i * 12;
      if (entry + 12 > view.byteLength) return;
      visit(view.getUint16(entry, le), entry);
    }
  };

  let exifIfd = 0;
  walk(view.getUint32(start + 4, le), (tag, entry) => {
    if (tag === 0x8769) exifIfd = view.getUint32(entry + 8, le);
  });
  const found: { original: string | null; offset: string | null } = { original: null, offset: null };
  if (exifIfd !== 0) {
    walk(exifIfd, (tag, entry) => {
      if (tag === 0x9003) found.original = text(entry);
      else if (tag === 0x9011) found.offset = text(entry);
    });
  }
  return found;
}

/** "2026:10:03 06:58:12" with an optional "-05:00" offset, as a Date; null if it isn't one. */
export function parseExifTime(original: string, offset: string | null): Date | null {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(original.trim());
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  if (year < 1990 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const o = offset === null ? null : /^([+-])(\d{2}):(\d{2})$/.exec(offset.trim());
  if (o) {
    const sign = o[1] === "-" ? -1 : 1;
    const shift = sign * (Number(o[2]) * 60 + Number(o[3])) * 60_000;
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - shift);
  }
  return new Date(year, month - 1, day, hour, minute, second);
}

/** The capture time of a JPEG, or null when it has none (or isn't a JPEG). */
export function captureTimeOf(buffer: ArrayBuffer): Date | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== SOI) return null;
  let at = 2;
  while (at + 4 <= view.byteLength && view.getUint8(at) === 0xff) {
    const marker = view.getUint8(at + 1);
    if (marker === SOS || marker === EOI) break;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    const length = view.getUint16(at + 2);
    if (marker === APP1 && ascii(view, at + 4, 6) === "Exif\0\0") {
      const { original, offset } = readTiff(view, at + 10);
      return original === null ? null : parseExifTime(original, offset);
    }
    at += 2 + length;
  }
  return null;
}
