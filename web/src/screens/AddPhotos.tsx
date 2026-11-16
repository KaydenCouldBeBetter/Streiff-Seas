// MY-04 Add photos (Figma 49:1999) and its NOT SENT state MY-04b (49:2078): up to 4 photos in
// all, append-only. The stored photos are kept and can't be removed or replaced (R-CAT-U-26);
// each new one is read for its capture time and re-encoded before it goes (photoPrepare.ts),
// then the server strips it again. A refusal (MY-04c) is shown on My catch, reloaded.

import { useEffect, useRef, useState } from "react";
import { PhotoSlot, type PhotoSlotState } from "../components/catch";
import { ActionBar, Banner, Button, NavBar } from "../components/ui";
import type { CatchBase, Change, ChangeResult } from "../lib/changeCatch";
import { notSentMessage } from "../lib/changeCopy";
import { photoSlotName, type Metric } from "../lib/catchForm";
import { MAX_PHOTOS, type MyCatchView } from "../lib/myCatches";
import type { PreparedPhoto } from "../lib/sendCatch";

interface Props {
  item: MyCatchView;
  base: CatchBase;
  metric: Metric;
  /** Capture time first, then the re-encode (photoPrepare.ts); throws on a photo it can't read. */
  prepare: (file: File, index: number) => Promise<PreparedPhoto>;
  send: (change: Change, retry: boolean) => Promise<ChangeResult>;
  /** Saved, already saved or refused: My catch takes it from here. */
  onDone: (result: ChangeResult, photos: number) => void;
  onCancel: () => void;
}

interface Picked {
  file: File;
  previewUrl: string;
}

/** "1 · Holding the fish", "2 · On the scale", "3 · Extra photo" (Figma MY-04a). */
function slotLabel(slot: number, metric: Metric): string {
  if (slot === 1) return "1 · Holding the fish";
  if (slot === 2) return metric === "weight" ? "2 · On the scale" : "2 · On the board";
  return `${slot} · Extra photo`;
}

export function AddPhotos({ item, base, metric, prepare, send, onDone, onCancel }: Props) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [phase, setPhase] = useState<"form" | "sending" | "not-sent">("form");
  // Prepared once and kept, so Retry sends the same files.
  const prepared = useRef<PreparedPhoto[] | null>(null);
  const urls = useRef<string[]>([]);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
      for (const url of urls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const free = MAX_PHOTOS - base.photoCount;
  const locked = phase !== "form";

  function pick(file: File) {
    const previewUrl = URL.createObjectURL(file);
    urls.current.push(previewUrl);
    setPicked((current) => (current.length < free ? [...current, { file, previewUrl }] : current));
  }

  async function upload(retry: boolean) {
    setPhase("sending");
    if (prepared.current === null) {
      try {
        const out: PreparedPhoto[] = [];
        for (const [index, photo] of picked.entries()) out.push(await prepare(photo.file, base.photoCount + index));
        prepared.current = out;
      } catch {
        // A photo the browser can't read won't read on a retry either.
        if (live.current) onDone({ kind: "refused", reason: "photo" }, picked.length);
        return;
      }
    }
    const result = await send({ action: "photos", photos: prepared.current }, retry);
    if (!live.current) return;
    if (result.kind === "not-sent") setPhase("not-sent");
    else onDone(result, picked.length);
  }

  const newState = (photo: Picked): PhotoSlotState =>
    phase === "sending"
      ? { kind: "uploading", previewUrl: photo.previewUrl, fraction: null }
      : phase === "not-sent"
        ? { kind: "failed", previewUrl: photo.previewUrl }
        : { kind: "filled", previewUrl: photo.previewUrl };
  const empties = locked ? 0 : free - picked.length;
  const message = notSentMessage("photos", picked.length);
  const upLabel = picked.length === 1 ? "Upload 1 photo" : `Upload ${picked.length} photos`;

  return (
    <div className="screen">
      <NavBar title="Add photos" backLabel="Catch" backName="Back to Catch" onBack={onCancel} />
      <div className="screen-content submit-content">
        {phase === "not-sent" ? (
          <Banner tone="danger" title={message.title}>
            {message.message}
          </Banner>
        ) : (
          <Banner tone="info" icon="/icons/flag-link.svg" title="The judge will take another look">
            Adding a photo marks the catch for review. Photos can't be removed or replaced once added.
          </Banner>
        )}

        <div className="photo-slots">
          {item.photos.map((photo, index) => (
            <PhotoSlot
              key={`kept-${index}`}
              label={slotLabel(index + 1, metric)}
              name={photoSlotName(index + 1, metric)}
              note="Kept"
              state={{ kind: "filled", previewUrl: photo.url ?? "" }}
            />
          ))}
          {picked.map((photo, index) => {
            const slot = base.photoCount + index + 1;
            return <PhotoSlot key={photo.previewUrl} label={slotLabel(slot, metric)} name={photoSlotName(slot, metric)} note="Ready to upload" state={newState(photo)} />;
          })}
          {Array.from({ length: empties }, (_, index) => {
            const slot = base.photoCount + picked.length + index + 1;
            return <PhotoSlot key={`free-${slot}`} label={slotLabel(slot, metric)} name={photoSlotName(slot, metric)} note="Optional" state={{ kind: "empty", onPick: pick }} />;
          })}
        </div>

        {phase === "form" && (
          <p className="t-footnote t-secondary">
            You can add {free} more ({MAX_PHOTOS} in total).
          </p>
        )}
      </div>

      <ActionBar>
        {phase === "form" ? (
          <>
            {picked.length === 0 && <p className="t-footnote t-secondary">Choose a photo to upload.</p>}
            <Button variant="primary" large disabled={picked.length === 0} onClick={() => void upload(false)}>
              {picked.length === 0 ? "Upload photos" : upLabel}
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" large loading={phase === "sending"} loadingLabel="Uploading…" onClick={() => void upload(true)}>
              Retry
            </Button>
            <Button variant="text" onClick={onCancel}>
              Cancel
            </Button>
          </>
        )}
      </ActionBar>
    </div>
  );
}
