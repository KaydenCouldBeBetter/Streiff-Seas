// ORG-07a Exports (Figma 95:5765; Desktop 226:4096): once the tournament is final, the results CSV
// and the audit CSV are built in this browser by web/src/lib/exports.ts (scoring.ts for the
// results), each with the SHA-256 of its exact bytes to post with the standings in the group chat
// (decisions.md 2026-09-30, 2026-10-05). The same data always gives the same file and hash.

import { useEffect, useState } from "react";
import { ExportCard, Note } from "../components/organizer";
import { Banner, Button, NavBar } from "../components/ui";
import { buildExports, loadExportData, type ExportFile, type ExportKind } from "../lib/exports";
import { pb } from "../lib/pb";

interface Props {
  eventId: string;
  onBack: () => void;
}

export function Exports({ eventId, onBack }: Props) {
  const [files, setFiles] = useState<Record<ExportKind, ExportFile> | null>(null);
  const [state, setState] = useState<"loading" | "error" | "not-final" | "ready">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setState("loading");
    loadExportData(pb, eventId)
      .then(async (data) => {
        if (data.event.status !== "final") {
          if (current) setState("not-final");
          return;
        }
        const built = await buildExports(data);
        if (!current) return;
        setFiles(built);
        setState("ready");
        document.title = `Exports · ${String(data.event.name)} · Streiff Seas`;
      })
      .catch(() => current && setState("error"));
    return () => {
      current = false;
    };
  }, [eventId, attempt]);

  return (
    <div className="screen screen-wide">
      <NavBar title="Exports" backLabel="Manage" backName="Back to Manage" onBack={onBack} />
      <div className="screen-content org-content">
        {state === "loading" && <p className="t-body t-secondary">Building the files…</p>}
        {state === "error" && (
          <Banner tone="danger" title="Couldn't build the files">
            Check your signal and try again.
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </Banner>
        )}
        {state === "not-final" && (
          <Banner tone="warning" title="Not final yet">
            The hashed files are built once the tournament is final. While it's closed, Manage shows a preview.
          </Banner>
        )}
        {state === "ready" && files && (
          <>
            <Banner tone="neutral" icon="/icons/lock-neutral.svg" title="Final">
              Share each file and its hash to the group chat, with the standings.
            </Banner>
            <ExportCard title="Results CSV" file={files.results} />
            <ExportCard title="Audit CSV" file={files.audit} />
            <Note>Each hash is of the exact file shared or downloaded. Anyone with the file can check it.</Note>
          </>
        )}
      </div>
    </div>
  );
}
