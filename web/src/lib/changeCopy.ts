// What the screens say after a change to a pending catch (MY-03b/c, MY-04b/c, MY-05b/c), worded
// as the Figma frames word them: a refusal is a banner on the reloaded My catch, saying why in
// terms of what changed (screens.md Gap 16), never blaming the angler. Pure.

import type { ChangeResult, RefusalReason } from "./changeCatch";
import { formatClubTime } from "./format";

export type ChangeAction = "edit" | "photos" | "retract";

export interface ChangeNotice {
  /** "info" for most refusals; "warning" (the clock) when the deadline passed; "success" when a Retry found it saved. */
  tone: "info" | "warning" | "success";
  title: string;
  message: string;
}

const REFUSED_TITLE: Record<ChangeAction, (photos: number) => string> = {
  edit: () => "Not saved",
  photos: (n) => (n === 1 ? "Photo not added" : "Photos not added"),
  retract: () => "Not retracted",
};

/** "while you were editing", "before your photo arrived", "before your retract arrived". */
function whileYou(action: ChangeAction, photos: number): string {
  if (action === "edit") return "while you were editing";
  if (action === "photos") return photos === 1 ? "before your photo arrived" : "before your photos arrived";
  return "before your retract arrived";
}

function refusedMessage(action: ChangeAction, reason: RefusalReason, photos: number, deadline: Date | undefined): string {
  switch (reason) {
    case "approved":
      return `The judge approved this catch ${whileYou(action, photos)}. It's shown as it is now.`;
    case "rejected":
      return `The judge rejected this catch ${whileYou(action, photos)}. It's shown as it is now.`;
    case "retracted":
      return "This catch was retracted, so it can't change now.";
    case "withdrawn":
      return "Your entry is withdrawn, so this catch can't change now.";
    case "deadline":
      return deadline
        ? `The submission deadline passed at ${formatClubTime(deadline)}, so this catch can't change now.`
        : "The submission deadline passed, so this catch can't change now.";
    case "full":
      return "This catch already has 4 photos, so no more can be added.";
    case "photo":
      return photos === 1 ? "The club couldn't accept that photo. Try another one." : "The club couldn't accept one of those photos. Try others.";
    case "changed":
      return "This catch changed since you opened it, perhaps on another device. It's shown as it is now.";
    case "unknown":
      return "The change wasn't accepted. The catch is shown as it is now.";
  }
}

/** The banner on My catch after a change came back refused or already saved; null when there's nothing to say. */
export function changeNotice(action: ChangeAction, result: ChangeResult, photos = 0): ChangeNotice | null {
  if (result.kind === "already-saved") {
    const what = action === "edit" ? "Your edit" : action === "photos" ? (photos === 1 ? "Your photo" : "Your photos") : "Your retract";
    return { tone: "success", title: "Already saved", message: `${what} reached the club before. Nothing was sent twice.` };
  }
  if (result.kind !== "refused") return null;
  const cameraRoll = action === "photos" ? (photos === 1 ? " Your photo is still in your camera roll." : " Your photos are still in your camera roll.") : "";
  return {
    tone: result.reason === "deadline" ? "warning" : "info",
    title: REFUSED_TITLE[action](photos),
    message: refusedMessage(action, result.reason, photos, result.submitDeadline) + cameraRoll,
  };
}

/** NOT SENT banner text (MY-03c, MY-04b, MY-05c). */
export function notSentMessage(action: ChangeAction, photos = 0): { title: string; message: string } {
  switch (action) {
    case "edit":
      return { title: "NOT SENT", message: "Your edit didn't reach the club, so the catch hasn't changed yet. Tap Retry when you have signal." };
    case "photos": {
      const which = photos === 1 ? "The photo" : "The photos";
      const still = photos === 1 ? "It's" : "They're";
      return { title: photos === 1 ? "Photo not uploaded" : "Photos not uploaded", message: `${which} didn't reach the club. ${still} still in your camera roll. Tap Retry when you have signal.` };
    }
    case "retract":
      return { title: "NOT SENT", message: "Your retract didn't reach the club. The catch is still pending until Retry gets through." };
  }
}
