// What happens to a picked photo before it is sent (decisions.md L2 steps 1 and 2; "Photo field
// limits"): read its capture time from the original bytes, then decode and re-encode it to JPEG
// at a 2560 px long edge, which drops its metadata. This is the first line of defence only: the
// server strips every photo with exiftool and refuses one that still carries anything
// location-capable (pb_hooks/catches_create.pb.js). DOM module: canvas, createImageBitmap.

import { captureTimeOf } from "./exifTime";
import type { PreparedPhoto } from "./sendCatch";

const LONG_EDGE = 2560;
const MAX_BYTES = 5 * 1024 * 1024;
/** Tried in turn until the JPEG fits under 5 MB (85% first: decisions.md "Photo field limits"). */
const QUALITIES = [0.85, 0.75, 0.6, 0.45];

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("the photo could not be encoded"))), "image/jpeg", quality);
  });
}

/** Capture time first (from the untouched file), then the re-encode. Throws if it can't be decoded. */
export async function preparePhoto(file: File, index: number): Promise<PreparedPhoto> {
  const capturedAt = captureTimeOf(await file.arrayBuffer());

  // "from-image" applies the EXIF orientation, so the rotation survives the metadata going.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const quality of QUALITIES) {
      const blob = await toBlob(canvas, quality);
      if (blob.size <= MAX_BYTES) return { file: new File([blob], `photo-${index + 1}.jpg`, { type: "image/jpeg" }), capturedAt };
    }
    throw new Error("the photo is still over 5 MB");
  } finally {
    bitmap.close();
  }
}
