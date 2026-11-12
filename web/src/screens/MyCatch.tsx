// MY-02 My catch: one own catch, its state, photos and what can still be done (Figma 47:1774
// pending, 102:7297 four photos, 102:7401 past the deadline, 102:7499 withdrawn, 47:1882
// verified, 48:1828 corrected, 48:1917 rejected, 48:1977 retracted, 102:7597 final).
// lib/myCatches.ts picks the row; controls whose screens aren't built yet carry a TodoTag.
// History opens MY-06a (MyCatchHistory.tsx) from every row.
// Never shown here: delete, remove or replace a photo, change the photo time, approve own
// (R-CAT-D-01, U-26, U-28, U-06), or flag codes.

import { CatchStatusChip, InBestMarker, PhotoViewer } from "../components/catch";
import { Banner, Button, NavBar, TabBar } from "../components/ui";
import { formatClubTime } from "../lib/format";
import { MAX_PHOTOS, myCatchState, type MyCatchesContext, type MyCatchState, type MyCatchView } from "../lib/myCatches";
import { MEMBER_TABS, type MemberTab } from "./memberTabs";

interface Props {
  context: MyCatchesContext;
  item: MyCatchView;
  onBack: () => void;
  /** The nav bar's History link (MY-06a). */
  onHistory: () => void;
  onTab: (tab: MemberTab) => void;
}

export function MyCatch({ context, item, onBack, onHistory, onTab }: Props) {
  const state = myCatchState(item, context);
  const note = noteFor(state, context);
  return (
    <div className="screen tab-screen">
      <NavBar title="Catch" backLabel="My catches" backName="Back to My catches" onBack={onBack} trailing={{ label: "History", onClick: onHistory }} />
      <div className="screen-content catch-detail">
        <PhotoViewer photos={item.photos} archived={state.photosArchived} />

        <div className="catch-summary">
          <p className="measurement">
            <span className="t-number-display">{item.measurement.value}</span>
            <span className="t-title-section t-secondary">{item.measurement.unit}</span>
          </p>
          <p className="t-headline">{item.species}</p>
          <p className="chips">
            <CatchStatusChip status={item.status} />
            {item.status === "verified" && item.inBest && <InBestMarker bestN={context.bestN} />}
          </p>
        </div>

        {state.statusRow === "MY-02f" && item.correction && (
          <Banner tone="info" icon="/icons/edit-link.svg" title="Corrected by the judge">
            {item.correction.change}.{item.reason && ` Reason: “${item.reason}”`} See History for every step.
          </Banner>
        )}

        {state.statusRow === "MY-02g" && (
          <section className="reason-box" aria-labelledby="reason-heading">
            <h2 id="reason-heading" className="t-headline">
              Why the judge rejected it
            </h2>
            <p className="t-body">“{item.reason}”</p>
            {item.decision && <p className="t-footnote t-secondary">{decidedBy(item.decision)}</p>}
          </section>
        )}

        {state.statusRow === "MY-02h" && (
          <Banner tone="neutral" icon="/icons/undo-neutral.svg" title="You retracted this catch">
            It never scores and other members can't see it. It stays on record. To replace it, submit a new catch.
          </Banner>
        )}

        <Facts state={state} item={item} />

        {(state.canEdit || state.canAddPhotos || state.canRetract) && (
          <div className="catch-actions">
            {state.canEdit && (
              <Button variant="secondary" full icon="/icons/edit-link.svg" todo="MY-03">
                Edit species or {context.metric}
              </Button>
            )}
            {state.canAddPhotos && (
              <Button variant="secondary" full icon="/icons/plus.svg" todo="MY-04">
                Add photos ({item.photos.length} of {MAX_PHOTOS} used)
              </Button>
            )}
            {state.canRetract && (
              <Button variant="text" icon="/icons/undo-link.svg" todo="MY-05">
                Retract this catch…
              </Button>
            )}
          </div>
        )}

        {note && <p className={state.statusRow === "MY-02g" ? "t-callout t-secondary" : "t-footnote t-secondary"}>{note}</p>}
      </div>

      <div className="tab-screen-bottom">
        {state.canSubmitNew && (
          <div className="action-bar-above-tabs">
            <Button variant="primary" large todo="SUB-01">
              Submit a new catch
            </Button>
          </div>
        )}
        <TabBar tabs={MEMBER_TABS} selected="catches" onSelect={onTab} />
      </div>
    </div>
  );
}

function decidedBy(decision: NonNullable<MyCatchView["decision"]>): string {
  return `${decision.by} · ${formatClubTime(decision.at)}`;
}

function Facts({ state, item }: { state: MyCatchState; item: MyCatchView }) {
  const rows: [string, string][] = [];
  const submitted: [string, string] = ["Submitted", formatClubTime(item.created)];
  const photoTaken: [string, string] | null = item.capturedAt ? ["Photo taken", formatClubTime(item.capturedAt)] : null;
  switch (state.statusRow) {
    case "MY-02a":
    case "MY-02b":
    case "MY-02c":
    case "MY-02d":
      rows.push(submitted);
      if (photoTaken) rows.push(photoTaken);
      rows.push(["Photos", `${item.photos.length} of ${MAX_PHOTOS}`]);
      break;
    case "MY-02e":
    case "MY-02f":
      if (item.decision) rows.push(["Decided by", decidedBy(item.decision)]);
      // A verified catch's reason, when the judge gave one; MY-02f shows it in its banner.
      if (state.statusRow === "MY-02e" && item.reason) rows.push(["Judge's note", `“${item.reason}”`]);
      rows.push(submitted);
      if (photoTaken) rows.push(photoTaken);
      break;
    case "MY-02g":
      // The reason box already says who decided and when.
      return null;
    case "MY-02h":
      if (item.retractedAt) rows.push(["Retracted", formatClubTime(item.retractedAt)]);
      rows.push(submitted);
      break;
  }
  return (
    <dl className="card card-sunken t-callout">
      {rows.map(([label, value]) => (
        <div key={label} className="fact">
          <dt className="t-secondary">{label}</dt>
          <dd className="t-callout-strong">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function noteFor(state: MyCatchState, context: MyCatchesContext): string | null {
  const deadline = formatClubTime(context.submitDeadline);
  if (state.row === "MY-02i") return "Results are final. Nothing about this catch can change.";
  switch (state.row) {
    case "MY-02a":
      return `You can change this catch until the judge decides or ${deadline}.`;
    case "MY-02b":
      return `All ${MAX_PHOTOS} photos are in, so no more can be added. You can still edit or retract this catch until the judge decides or ${deadline}.`;
    case "MY-02c":
      return `Waiting for the judge. The submission deadline passed ${deadline}, so this catch can't be changed now.`;
    case "MY-02d":
      return context.entry === "withdrawn-self"
        ? "You've withdrawn, so this catch can't be changed. It's still judged, and counts again if you rejoin."
        : "The organizer withdrew your entry, so this catch can't be changed. It's still judged.";
    case "MY-02e":
      return "Verified catches can't be changed. If something looks wrong, ask the judge before results are final.";
    case "MY-02g":
      return state.canSubmitNew
        ? "Only you and the judges can see this catch. To try again, submit it as a new catch."
        : "Only you and the judges can see this catch.";
    case "MY-02f":
    case "MY-02h":
      return null;
  }
}
