// Club time (America/New_York) for the tournament form's date and time fields (ORG-02, ORG-03;
// Figma P12: "both read and save as Eastern time"). A `datetime-local` input gives a wall time
// with no zone, "2027-07-04T06:00"; these turn it into the moment it names in Eastern time and
// back, whatever the phone's own zone. Pure: Intl only, no DOM, no dependency.
//
// Daylight saving: a wall time in the spring-forward gap (2:00 to 2:59 AM on the second Sunday
// of March) doesn't exist; it is read as the same clock time on standard time, i.e. one hour
// later on the summer clock (2:30 AM → 3:30 AM EDT), as most calendars do. A wall time in the
// repeated hour of the fall-back night (1:00 to 1:59 AM, first Sunday of November) is read as
// the first of the two (EDT).

export const CLUB_ZONE = "America/New_York";

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: CLUB_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** The Eastern wall clock at a moment, as numbers. */
function wallAt(ms: number): Wall & { second: number } {
  const part: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of PARTS.formatToParts(new Date(ms))) part[type] = value;
  return {
    year: Number(part.year),
    month: Number(part.month),
    day: Number(part.day),
    hour: Number(part.hour),
    minute: Number(part.minute),
    second: Number(part.second),
  };
}

/** Eastern offset from UTC at a moment, in ms (EDT −4 h, EST −5 h). */
function offsetAt(ms: number): number {
  const wall = wallAt(ms);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

const INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * "2027-07-04T06:00" read as Eastern wall time → "2027-07-04T10:00:00.000Z". Throws a RangeError
 * on anything that isn't a `datetime-local` value or a real calendar date.
 */
export function clubInputToIso(value: string): string {
  const match = INPUT.exec(value);
  if (!match) throw new RangeError(`not a date and time: ${JSON.stringify(value)}`);
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(naive);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) {
    throw new RangeError(`not a calendar date: ${value}`);
  }
  // Try the offset in force a little before and a little after; the earlier (summer) reading wins
  // in the repeated hour, and in the gap neither matches, so the standard-time reading is used.
  const candidates = [offsetAt(naive - 12 * 3600_000), offsetAt(naive + 12 * 3600_000)].sort((a, b) => b - a);
  for (const offset of candidates) {
    const ms = naive - offset;
    const wall = wallAt(ms);
    if (wall.year === year && wall.month === month && wall.day === day && wall.hour === hour && wall.minute === minute) {
      return new Date(ms).toISOString();
    }
  }
  return new Date(naive - Math.min(...candidates)).toISOString();
}

/** A stored moment → the `datetime-local` value for its Eastern wall time; "" for none. */
export function isoToClubInput(at: Date | null): string {
  if (at === null || Number.isNaN(at.getTime())) return "";
  const wall = wallAt(at.getTime());
  const two = (n: number) => String(n).padStart(2, "0");
  return `${wall.year}-${two(wall.month)}-${two(wall.day)}T${two(wall.hour)}:${two(wall.minute)}`;
}

/** True when the phone's own zone keeps Eastern time, so the form needn't say "Times here are Eastern". */
export function phoneIsClubTime(phoneZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone): boolean {
  if (phoneZone === CLUB_ZONE) return true;
  // Another zone name on the same clock all year (e.g. America/Detroit) counts too.
  const year = new Date().getUTCFullYear();
  const probes = [Date.UTC(year, 0, 15, 12), Date.UTC(year, 6, 15, 12)];
  const phone = new Intl.DateTimeFormat("en-US", { timeZone: phoneZone, hour: "2-digit", hourCycle: "h23", day: "2-digit" });
  const club = new Intl.DateTimeFormat("en-US", { timeZone: CLUB_ZONE, hour: "2-digit", hourCycle: "h23", day: "2-digit" });
  return probes.every((ms) => phone.format(ms) === club.format(ms));
}

/** "Central time" style name of the phone's zone for the note; falls back to the zone id. */
export function phoneZoneName(phoneZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: phoneZone, timeZoneName: "longGeneric" })
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName")?.value;
  return name ? name.replace(/ Time$/, " time") : phoneZone;
}
