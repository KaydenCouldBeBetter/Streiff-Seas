// ORG-02 New tournament and Edit draft, ORG-03 Edit live and Edit closed (Figma 93:5071, 93:5168,
// 93:5256, 93:5345, 94:5310, 94:5399, 94:5472; Desktop 227:4079, 227:4297): one form in sections
// (no wizard), labels above fields, validated on Save. Dates read and save as Eastern time (P12).
// A draft saves even incomplete (Gap 11); once live or closed, locked fields stay visible with a
// lock and their reason (§14.3). The body sends only what changed and may change (eventAdmin.ts).

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckGroup, DateTimeField, Note, PickerField } from "../components/organizer";
import { ActionBar, Banner, Button, LockedField, NavBar, SegmentedToggle, SwitchRow, TextField } from "../components/ui";
import { clubInputToIso, phoneIsClubTime, phoneZoneName } from "../lib/clubTime";
import {
  EMPTY_FORM,
  editableFields,
  eventBody,
  formErrors,
  lockReason,
  refusalCopy,
  retryCreateDraft,
  retryEventChange,
  sendEventChange,
  type EventForm as Form,
  type FormErrors,
  type ManageData,
  type Person,
} from "../lib/eventAdmin";
import { formatClubTime } from "../lib/format";
import type { TournamentStatus } from "../lib/liveTournament";
import { pb } from "../lib/pb";
import { Species } from "./Species";

interface Props {
  /** A new draft, or the event as Manage loaded it. */
  editing: ManageData | null;
  /** The pickers and species for a new draft (loadNewEventOptions). */
  options: { people: Person[]; species: { id: string; name: string }[] };
  me: string;
  onBack: () => void;
  /** Saved: the event's id (a new draft opens its Manage). */
  onSaved: (eventId: string, message: string) => void;
}

type Phase = "form" | "sending" | "not-sent";

const METRICS = [
  { id: "weight", label: "Weight" },
  { id: "length", label: "Length" },
] as const;

export function EventForm({ editing, options, me, onBack, onSaved }: Props) {
  const status: TournamentStatus | "new" = editing?.status ?? "new";
  const original = editing?.form;
  const [form, setForm] = useState<Form>(() => original ?? { ...EMPTY_FORM, judge: options.people.find((person) => person.id === me && person.organizer)?.id ?? "" });
  const [species, setSpecies] = useState(options.species);
  const [errors, setErrors] = useState<FormErrors>({});
  const [phase, setPhase] = useState<Phase>("form");
  const [problem, setProblem] = useState<{ title: string; message: string } | null>(null);
  const [addingSpecies, setAddingSpecies] = useState(false);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  const editable = editableFields(status);
  const title = status === "new" ? "New tournament" : status === "draft" ? "Edit draft" : status === "live" ? "Edit live tournament" : "Edit closed tournament";

  useEffect(() => {
    document.title = `${title} · Streiff Seas`;
  }, [title]);

  // Leaving a NOT SENT form asks first (responsive spec 231:5828).
  useEffect(() => {
    if (phase !== "not-sent") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  const organizers = useMemo(() => options.people.filter((person) => person.organizer), [options.people]);
  const backups = useMemo(() => options.people.filter((person) => person.id !== form.judge), [options.people, form.judge]);
  const locked = phase !== "form" && phase !== "sending" ? true : phase === "sending";
  const deadline = useMemo(() => {
    if (form.endsAt === "") return null;
    try {
      return new Date(Date.parse(clubInputToIso(form.endsAt)) + 24 * 3600_000 + (editing?.deadlineExtMin ?? 0) * 60_000);
    } catch {
      return null;
    }
  }, [form.endsAt, editing?.deadlineExtMin]);

  async function save() {
    const found = formErrors(form, status, original, editing?.windowOpen ?? true);
    setErrors(found);
    setProblem(null);
    if (Object.values(found).some(Boolean)) {
      setProblem({ title: "Fix the fields marked below", message: "Then save again." });
      return;
    }
    const body = eventBody(form, status, original);
    if (status !== "new" && Object.keys(body).length === 0) {
      setProblem({ title: "Nothing to save", message: "Nothing was changed." });
      return;
    }
    const retry = phase === "not-sent";
    setPhase("sending");
    const result =
      status === "new"
        ? retry
          ? await retryCreateDraft(pb, body)
          : await sendEventChange(pb, null, body)
        : retry
          ? await retryEventChange(pb, editing!.eventId, body)
          : await sendEventChange(pb, editing!.eventId, body);
    if (!live.current) return;
    switch (result.kind) {
      case "saved":
        onSaved(result.event.id, status === "new" ? "Draft saved. The judge and backup judge are entered." : "Saved.");
        return;
      case "already-saved":
        onSaved(editing!.eventId, "Saved (it had already been saved).");
        return;
      case "not-sent":
        setPhase("not-sent");
        return;
      case "refused":
        setPhase("form");
        setProblem(refusalCopy(result.reason, result.event));
        if (result.reason === "judge_is_backup") setErrors({ judge: "The judge and the backup judge must be different people.", backupJudge: "The judge and the backup judge must be different people." });
        if (result.reason === "judge_not_organizer") setErrors({ judge: "Only an organizer can be the judge." });
        if (result.reason === "ends_at_earlier" || result.reason === "ends_at_window_closed") setErrors({ endsAt: refusalCopy(result.reason).message });
    }
  }

  if (addingSpecies) {
    return (
      <Species
        backLabel={status === "new" ? "New tournament" : "Edit draft"}
        onBack={async (added) => {
          setAddingSpecies(false);
          const records = await pb.collection("species").getFullList({ requestKey: null }).catch(() => null);
          if (records) setSpecies(records.map((record) => ({ id: record.id, name: String(record.name).charAt(0).toUpperCase() + String(record.name).slice(1) })).sort((a, b) => a.name.localeCompare(b.name)));
          if (added) set("species", [...form.species, added]);
        }}
      />
    );
  }

  const nameOf = (id: string) => options.people.find((person) => person.id === id)?.name ?? "No one yet";
  const speciesNames = species.filter((item) => form.species.includes(item.id)).map((item) => item.name).join(", ") || "None";
  const can = (field: keyof Form) => editable.has(field) && !locked;
  const lock = (field: keyof Form, label: string, value: string) => <LockedField label={label} value={value} note={status === "new" ? undefined : lockReason(field, status)} />;

  return (
    <div className="screen screen-wide">
      <NavBar title={title} backLabel="Back" backName={editing ? "Back to Manage" : "Back to Tournaments"} onBack={onBack} />
      <form
        className="screen-content org-content event-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {!phoneIsClubTime() && <Note>Your phone is on {phoneZoneName()}. Times here are Eastern.</Note>}
        {phase === "not-sent" && (
          <Banner tone="danger" title="NOT SENT">
            The change didn't reach the club. Retry checks the tournament first, so it is never saved twice.
          </Banner>
        )}
        {problem && (
          <Banner tone="danger" title={problem.title}>
            {problem.message}
          </Banner>
        )}

        <section className="org-section" aria-labelledby="basics-heading">
          <h2 id="basics-heading" className="t-title-section">
            Basics
          </h2>
          {can("name") ? (
            <TextField id="event-name" label="Name" help="Members see it on Home and the leaderboard." placeholder="e.g. Summer Bass 2028" error={errors.name} value={form.name} onValueChange={(value) => set("name", value)} />
          ) : (
            lock("name", "Name", form.name)
          )}
        </section>

        <section className="org-section" aria-labelledby="dates-heading">
          <h2 id="dates-heading" className="t-title-section">
            Dates
          </h2>
          {can("startsAt") ? (
            <DateTimeField id="event-starts" label="Starts" help="Fishing counts from this time." error={errors.startsAt} value={form.startsAt} onValueChange={(value) => set("startsAt", value)} />
          ) : (
            lock("startsAt", "Starts", form.startsAt ? formatClubTime(new Date(clubInputToIso(form.startsAt))) : "Not set")
          )}
          {can("endsAt") && (status !== "live" || editing?.windowOpen) ? (
            <DateTimeField
              id="event-ends"
              label="Ends"
              help={status === "live" ? "Later only, while fishing is still on. The final deadline moves with it." : "Fishing stops at this time."}
              error={errors.endsAt}
              value={form.endsAt}
              min={status === "live" ? original?.endsAt : undefined}
              onValueChange={(value) => set("endsAt", value)}
            />
          ) : (
            <LockedField
              label="Ends"
              value={form.endsAt ? formatClubTime(new Date(clubInputToIso(form.endsAt))) : "Not set"}
              note={status === "live" ? "Fishing has ended, so the end can't move now." : lockReason("endsAt", status === "new" ? "draft" : status)}
            />
          )}
          <LockedField
            label="Final deadline"
            value={deadline ? formatClubTime(deadline) : "Set once saved"}
            note={`24 h after the end${editing && editing.deadlineExtMin > 0 ? `, plus the ${editing.deadlineExtMin / 60} h outage extension` : ", plus any outage extension"}`}
          />
        </section>

        <section className="org-section" aria-labelledby="scoring-heading">
          <h2 id="scoring-heading" className="t-title-section">
            Scoring
          </h2>
          {can("metric") ? (
            <div className="field">
              <span id="metric-label" className="t-callout-strong">
                Scored by
              </span>
              <SegmentedToggle labelledBy="metric-label" options={METRICS} selected={form.metric} onSelect={(value) => set("metric", value)} />
            </div>
          ) : (
            lock("metric", "Scored by", form.metric === "length" ? "Length" : "Weight")
          )}
          {can("bestN") ? (
            <TextField id="event-best-n" label="Fish counted" help="Each angler's best this many verified fish make the score." inputMode="numeric" error={errors.bestN} value={form.bestN} onValueChange={(value) => set("bestN", value)} />
          ) : (
            lock("bestN", "Fish counted", `Best ${form.bestN}`)
          )}
        </section>

        <section className="org-section" aria-label="Species">
          {can("species") ? (
            <CheckGroup legend="Species" options={species} selected={form.species} onChange={(value) => set("species", value)}>
              <div>
                <Button variant="text" icon="/icons/plus.svg" onClick={() => setAddingSpecies(true)}>
                  Add a species
                </Button>
              </div>
            </CheckGroup>
          ) : (
            <>
              <h2 className="t-title-section">Species</h2>
              {lock("species", "Species", speciesNames)}
            </>
          )}
        </section>

        <section className="org-section" aria-labelledby="people-heading">
          <h2 id="people-heading" className="t-title-section">
            People
          </h2>
          {can("judge") ? (
            <PickerField
              id="event-judge"
              label="Judge"
              help="Only organizers can judge."
              error={errors.judge}
              value={form.judge}
              options={organizers}
              sheetTitle="Choose the judge"
              sheetNote="Only organizers can judge."
              onChange={(value) => set("judge", value)}
            />
          ) : (
            lock("judge", "Judge", nameOf(form.judge))
          )}
          {can("backupJudge") ? (
            <PickerField
              id="event-backup"
              label="Backup judge"
              help="Judges the judge's own catches. Any member."
              error={errors.backupJudge}
              value={form.backupJudge}
              options={backups}
              sheetTitle="Choose the backup judge"
              sheetNote="Anyone but the judge."
              allowNone={status === "new" || status === "draft"}
              onChange={(value) => set("backupJudge", value)}
            />
          ) : (
            lock("backupJudge", "Backup judge", nameOf(form.backupJudge))
          )}
          {status !== "final" && (
            <Note>
              {status === "closed" ? "A backup judge named now isn't entered: no one can join or submit once closed." : "Saving enters the judge and backup judge in this tournament."}
            </Note>
          )}
        </section>

        <section className="org-section" aria-labelledby="code-word-heading">
          <h2 id="code-word-heading" className="t-title-section">
            Code word
          </h2>
          {can("codeWordOn") ? (
            <SwitchRow id="event-code-word-on" label="Code word" detail="Anglers show a word on a card in a required photo" checked={form.codeWordOn} onChange={(value) => set("codeWordOn", value)} />
          ) : (
            lock("codeWordOn", "Code word", form.codeWordOn ? "On" : "Off")
          )}
          {form.codeWordOn &&
            (can("codeWord") ? (
              <TextField
                id="event-code-word"
                label="The word"
                help={status === "live" ? "Changing it keeps the old word for the judges. Post the new one in the group chat." : "Shown on the submit screen."}
                autoComplete="off"
                value={form.codeWord}
                onValueChange={(value) => set("codeWord", value)}
              />
            ) : (
              lock("codeWord", "The word", form.codeWord || "Not set")
            ))}
        </section>

        <ActionBar>
          <Button variant="primary" large type="submit" loading={phase === "sending"} loadingLabel="Saving…">
            {phase === "not-sent" ? "Retry" : status === "new" ? "Save draft" : "Save"}
          </Button>
        </ActionBar>
      </form>
    </div>
  );
}
