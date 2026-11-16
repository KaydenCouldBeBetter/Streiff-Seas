// RULES-01a Club rules (Figma 120:9278, 120:9358): the rules a member needs while fishing, worded
// from the scoring.md version in force (§2, §5, §6) and the photo field limits (decisions.md
// 2026-10-01). Pure: no DOM. test/clubRules.test.ts fails when scoring.md's version moves, so a
// rule change can't ship with this page still describing the old one.

import { formatClubTime, formatClubTimeShort } from "./format";
import type { LiveTournament } from "./liveTournament";

/** scoring.md's Status line: the version in force and the day it took effect. */
export const RULES_VERSION = "0.6.1";
export const RULES_IN_FORCE = "Oct 5, 2026";

export interface RulesSection {
  title: string;
  items: readonly string[];
}

/** Sections 1 to 5, as the Figma frames word them. */
export const CLUB_RULES: readonly RulesSection[] = [
  {
    title: "What counts",
    items: [
      "Only the tournament's species can be submitted.",
      "The fish is caught during the fishing window, legally under NYSDEC rules.",
      "Any legal water counts.",
      "Fish can be kept or released.",
    ],
  },
  {
    title: "Proof photos",
    items: [
      "Two photos are required, both taken when you catch the fish: (1) you holding the fish, with the whole fish in view; (2) the fish on the scale with the readout legible, or on the board with its mouth closed at the zero end.",
      "Up to 2 more photos, 4 in total.",
      "Photos can't be removed or replaced. A photo added later is flagged for the judge.",
    ],
  },
  {
    title: "Code word",
    items: [
      "When a tournament uses one, show it on a card in either required photo.",
      "If the word changes, show the word that was in effect when you took your first photo.",
    ],
  },
  {
    title: "Submitting",
    items: [
      "One fish per submission, within 24 hours of the catch. Late ones are flagged and usually rejected.",
      "The final deadline is 24 hours after the window closes.",
      "You can edit or retract a catch while it's pending. After a rejection, submit it as a new catch.",
      "If the app is down, the time limits stretch by the length of the outage.",
    ],
  },
  {
    title: "Photo limits",
    items: [
      "JPEG, up to 5 MB each. The app converts and resizes for you.",
      "At most 4 photos per catch.",
      "The app keeps the time each photo was taken and removes everything else, including location.",
    ],
  },
];

export interface Fact {
  label: string;
  value: string;
  /** A second line under the value: the extension note (screens.md Gap 28). */
  note?: string;
}

/** "Largemouth bass", "Smallmouth bass" → "Largemouth, smallmouth", as the frame writes them. */
function speciesList(names: readonly string[]): string {
  return names.map((name, index) => {
    const word = name.replace(/ bass$/i, "");
    return index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word.toLowerCase();
  }).join(", ");
}

/**
 * Section 6 "This tournament", shown only when Club rules opens from a tournament page (Gap 37).
 * The code word itself stays on the submit screen; here it is only On or Off.
 */
export function thisTournament(tournament: LiveTournament): Fact[] {
  const { submit } = tournament;
  const extendedHours = Math.round((tournament.deadlineExtMin ?? 0) / 60);
  return [
    { label: "Species", value: speciesList(submit.species.map((species) => species.name)) },
    { label: "Scored by", value: `${submit.metric === "weight" ? "Weight" : "Length"} · best ${tournament.bestN}` },
    { label: "Window", value: `${formatClubTimeShort(tournament.startsAt)} – ${formatClubTimeShort(submit.endsAt)}` },
    {
      label: "Final deadline",
      value: formatClubTime(submit.submitDeadline),
      ...(extendedHours > 0 ? { note: `extended by ${extendedHours} h after an outage` } : {}),
    },
    { label: "Code word", value: submit.codeWord === null ? "Off" : "On" },
  ];
}
