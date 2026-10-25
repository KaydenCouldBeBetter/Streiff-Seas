// Sample data and a pretend sender for the SUB-01a skeleton, matching the Figma prototype's
// flow 2b (Submit → NOT SENT → Retry → Received: 66:5838, 66:5861, 66:5888, 66:5936). Nothing
// here talks to PocketBase. Replace SAMPLE_SUBMIT with the event and entry reads once M0-03
// opens them, and createSampleSender with the real sender in S1 (see catchSender.ts).

import { SAMPLE_TOURNAMENT } from "./sampleTournament";
import type { Metric } from "./catchForm";
import type { CatchSender, ReceivedCatch, SendProgress, SpeciesChoice } from "./catchSender";

export interface SubmitTournament {
  eventId: string;
  name: string;
  metric: Metric;
  endsAt: Date;
  submitDeadline: Date;
  /** `code_word` when `code_word_on`, else null. */
  codeWord: string | null;
  /** This event's `species` only (R-CAT-C-09); the angler's most recent first, never pre-selected. */
  species: readonly SpeciesChoice[];
}

export const SAMPLE_SUBMIT: SubmitTournament = {
  eventId: "sample-event",
  name: SAMPLE_TOURNAMENT.name,
  metric: "weight",
  endsAt: SAMPLE_TOURNAMENT.endsAt,
  submitDeadline: SAMPLE_TOURNAMENT.submitDeadline,
  codeWord: "MAPLE",
  species: [
    { id: "sample-largemouth", name: "Largemouth bass" },
    { id: "sample-smallmouth", name: "Smallmouth bass" },
  ],
};

const STEP_MS = 150;
const STEPS_PER_PHOTO = 5;
/** 3 of 5 steps: "Uploading… 60%", as in the prototype's Sending frame. */
const FAIL_STEP = 3;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Walks the prototype's flow 2b for every new catch: the first send stalls at 60% of the last
 * photo and comes back NOT SENT; the retry (same client_uuid) goes through and is Received.
 * About 1.5 s per attempt, like the prototype.
 */
export function createSampleSender(): CatchSender {
  const attempted = new Set<string>();
  return async (draft, onProgress) => {
    const fails = !attempted.has(draft.clientUuid);
    attempted.add(draft.clientUuid);
    const photoCount = draft.photos.length;
    for (let photo = 1; photo <= photoCount; photo += 1) {
      for (let step = 0; step <= STEPS_PER_PHOTO; step += 1) {
        const progress: SendProgress = { photo, photoCount, fraction: step / STEPS_PER_PHOTO };
        onProgress(progress);
        await wait(STEP_MS);
        if (fails && photo === photoCount && step === FAIL_STEP) return { kind: "not-sent" };
      }
    }
    const stored: ReceivedCatch = {
      id: "sample-catch",
      created: new Date(),
      species: draft.species.name,
      // The real sender shows the stored weight_hoz in the viewer's display units (S1, S2a).
      measurement: splitMeasurement(draft.enteredMeasurement),
      photoCount,
    };
    return { kind: "received", catch: stored };
  };
}

/** "3.44 lb" → { value: "3.44", unit: "lb" }; "3 lb 7.0 oz" → { value: "3 lb 7.0", unit: "oz" }. */
function splitMeasurement(text: string): { value: string; unit: string } {
  const space = text.lastIndexOf(" ");
  return { value: text.slice(0, space), unit: text.slice(space + 1) };
}
