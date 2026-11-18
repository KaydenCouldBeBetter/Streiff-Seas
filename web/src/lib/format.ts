// Display formatting shared by the screens. Pure: no DOM, no PocketBase.

const CLUB_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * A moment in club time, 12-hour, the same on every phone whatever its own zone
 * (decisions.md 2026-10-02 "Display decisions for the UI" (4)): "Sun, Aug 15, 8:00 PM".
 */
export function formatClubTime(at: Date): string {
  const part: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of CLUB_TIME.formatToParts(at)) part[type] = value;
  return `${part.weekday}, ${part.month} ${part.day}, ${part.hour}:${part.minute} ${part.dayPeriod}`;
}

/** A moment in club time without the weekday, for a range: "Jul 4, 6:00 AM" (Figma 120:9412). */
export function formatClubTimeShort(at: Date): string {
  const part: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of CLUB_TIME.formatToParts(at)) part[type] = value;
  return `${part.month} ${part.day}, ${part.hour}:${part.minute} ${part.dayPeriod}`;
}

const CLUB_TIME_SPOKEN = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "long",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** A moment in club time as read aloud: "Saturday July 10, 9:14 AM" (Figma Timeline item VoiceOver note). */
export function formatClubTimeSpoken(at: Date): string {
  const part: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of CLUB_TIME_SPOKEN.formatToParts(at)) part[type] = value;
  return `${part.weekday} ${part.month} ${part.day}, ${part.hour}:${part.minute} ${part.dayPeriod}`;
}

/** "1st", "2nd", "4th", "11th"; a shared place is "T-2" (decisions.md 2026-10-03). */
export function placeLabel(place: number, tied: boolean): string {
  if (!Number.isInteger(place) || place < 1) throw new RangeError(`place must be a positive integer, got ${place}`);
  if (tied) return `T-${place}`;
  const lastTwo = place % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? "th" : (["th", "st", "nd", "rd"][place % 10] ?? "th");
  return `${place}${suffix}`;
}

/** A leaderboard row's place column: "1", "4"; a shared place is "T-2" (Figma Leaderboard row). */
export function rowPlace(place: number, tied: boolean): string {
  const label = placeLabel(place, tied);
  return tied ? label : String(place);
}

/** A place as read aloud: "4th", or "Tied for 2nd" (Figma Leaderboard row VoiceOver note). */
export function spokenPlace(place: number, tied: boolean): string {
  const ordinal = placeLabel(place, false);
  return tied ? `Tied for ${ordinal}` : ordinal;
}

const CLUB_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const CLUB_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });

/** The clock time alone, in club time: "6:58 AM" (Figma LB-02a "· photo 6:58 AM"). */
export function formatClubClock(at: Date): string {
  const part: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of CLUB_CLOCK.formatToParts(at)) part[type] = value;
  return `${part.hour}:${part.minute} ${part.dayPeriod}`;
}

/** Whether two moments fall on the same club (America/New_York) calendar day. */
export function sameClubDay(a: Date, b: Date): boolean {
  return CLUB_DAY.format(a) === CLUB_DAY.format(b);
}

const CLUB_DATE = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });

/** A club calendar day: "Sun, Jul 4" (Figma EVT-01b tournament card). */
export function formatClubDay(at: Date): string {
  const part: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of CLUB_DATE.formatToParts(at)) part[type] = value;
  return `${part.weekday}, ${part.month} ${part.day}`;
}
