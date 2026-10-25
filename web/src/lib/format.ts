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

/** "1st", "2nd", "4th", "11th"; a shared place is "T-2" (decisions.md 2026-10-03). */
export function placeLabel(place: number, tied: boolean): string {
  if (!Number.isInteger(place) || place < 1) throw new RangeError(`place must be a positive integer, got ${place}`);
  if (tied) return `T-${place}`;
  const lastTwo = place % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? "th" : (["th", "st", "nd", "rd"][place % 10] ?? "th");
  return `${place}${suffix}`;
}
