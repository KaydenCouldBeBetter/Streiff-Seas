// The flag codes on a catch (security.md "Flag codes"), as the judge's screens show them: the code
// itself with a short note ("late_submit · 26 h"), the spoken name the Figma Flag chip asks for
// ("Flag: late submit, 26 hours (late_submit)"), and the time from photo to receipt the judge uses
// to apply an outage allowance (scoring.md §6, example 22). Judge screens only (JDG-01, JDG-02):
// members never see flag codes (screens.md Gap 23). Pure: no DOM, no PocketBase.

export const FLAG_CODES = [
  "no_capture_time",
  "before_window",
  "after_window",
  "late_submit",
  "photo_added",
  "extra_photo_no_time",
  "extra_photo_far",
] as const;

export type FlagCode = (typeof FLAG_CODES)[number];

const HOUR_MS = 3600_000;
const MINUTE_MS = 60_000;

/** What a flag's note is worked out from. */
export interface FlagContext {
  /** captured_at: the first photo's capture time, when it had one. */
  capturedAt: Date | null;
  /** created: when the server received the catch. */
  created: Date;
  /** photo_captured_at, in photo order (null when missing). */
  photoTimes: readonly (Date | null)[];
}

/** "26 h", or "37 min" under an hour. Whole units, rounded down, so "26 h" never means 25.6. */
export function gapText(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < HOUR_MS) return `${Math.floor(abs / MINUTE_MS)} min`;
  return `${Math.floor(abs / HOUR_MS)} h`;
}

/** The queue's receipt line: "2 h after photo", "37 min after photo" or "photo time missing" (Figma JDG-01a). */
export function receiptGap(capturedAt: Date | null, created: Date): string {
  if (!capturedAt) return "photo time missing";
  const ms = created.getTime() - capturedAt.getTime();
  return ms < 0 ? `${gapText(ms)} before photo` : `${gapText(ms)} after photo`;
}

/** The farthest extra photo from photo 1, for extra_photo_far ("31 h apart"). */
function farthestExtra(ctx: FlagContext): number | null {
  if (!ctx.capturedAt) return null;
  let far: number | null = null;
  for (const time of ctx.photoTimes.slice(1)) {
    if (!time) continue;
    const gap = Math.abs(time.getTime() - ctx.capturedAt.getTime());
    if (far === null || gap > far) far = gap;
  }
  return far;
}

/** The note after the code, or null when the code says it all. */
function note(code: FlagCode, ctx: FlagContext): string | null {
  switch (code) {
    case "late_submit":
      return ctx.capturedAt ? gapText(ctx.created.getTime() - ctx.capturedAt.getTime()) : null;
    case "photo_added":
      return "added later";
    case "extra_photo_far": {
      const far = farthestExtra(ctx);
      return far === null ? null : `${gapText(far)} apart`;
    }
    default:
      return null;
  }
}

/** "late_submit · 26 h", as the Figma Flag chip shows it. */
export function flagLabel(code: FlagCode, ctx: FlagContext): string {
  const extra = note(code, ctx);
  return extra ? `${code} · ${extra}` : code;
}

/** "Flag: late submit, 26 hours (late_submit)" (Figma Flag chip VoiceOver note). */
export function flagSpoken(code: FlagCode, ctx: FlagContext): string {
  const words = code.replaceAll("_", " ");
  const extra = note(code, ctx)?.replace(/(\d+) h\b/, "$1 hours").replace(/(\d+) min\b/, "$1 minutes");
  return `Flag: ${words}${extra ? `, ${extra}` : ""} (${code})`;
}

/** The known codes of a stored `flags` value, in the fixed order; anything else is dropped. */
export function flagsOf(value: unknown): FlagCode[] {
  const codes = Array.isArray(value) ? value.map(String) : [];
  return FLAG_CODES.filter((code) => codes.includes(code));
}
