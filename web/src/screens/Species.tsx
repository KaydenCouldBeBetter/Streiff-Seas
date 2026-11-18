// ORG-10 Species (Figma 96:6241, 96:6286 duplicate; Desktop 227:4681): every species, and adding
// one for future tournaments (R-SPC-C-01). No rename or delete (R-SPC-U-01, D-01: break-glass
// only). Opened from Home, or from "Add a species" on the tournament form, which it returns to
// with the new species ticked (3.3.7).

import { useCallback, useEffect, useState } from "react";
import { Note } from "../components/organizer";
import { Banner, Button, NavBar, TextField } from "../components/ui";
import { addSpecies } from "../lib/eventAdmin";
import { speciesLabel } from "../lib/liveTournament";
import { pb } from "../lib/pb";

interface Props {
  /** Where Back goes, for its accessible name: "Tournaments", "New tournament", "Edit draft". */
  backLabel: string;
  /** Back, with the id of a species added here (the form ticks it). */
  onBack: (added: string | null) => void;
}

export function Species({ backLabel, onBack }: Props) {
  const [species, setSpecies] = useState<{ id: string; name: string }[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [added, setAdded] = useState<{ id: string; name: string } | null>(null);

  const read = useCallback(async () => {
    try {
      const records = await pb.collection("species").getFullList({ requestKey: null });
      setSpecies(records.map((record) => ({ id: record.id, name: speciesLabel(String(record.name)) })).sort((a, b) => a.name.localeCompare(b.name)));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void read();
    document.title = "Species · Streiff Seas";
  }, [read]);

  async function add() {
    if (sending) return;
    setError(null);
    setProblem(null);
    setAdded(null);
    setSending(true);
    const result = await addSpecies(pb, name, species ?? []);
    setSending(false);
    switch (result.kind) {
      case "saved":
        setAdded({ id: result.id, name: result.name });
        setName("");
        await read();
        break;
      case "duplicate":
        setError(`That species already exists: ${result.existing}.`);
        break;
      case "invalid":
        setError("Write the species name in words, with single spaces.");
        break;
      case "not-sent":
        setProblem("The species didn't reach the club. Check your signal and try again.");
        break;
      case "not-accepted":
        setProblem("Only an organizer can add a species.");
        break;
    }
  }

  return (
    <div className="screen screen-wide">
      <NavBar title="Species" backLabel="Back" backName={`Back to ${backLabel}`} onBack={() => onBack(added?.id ?? null)} />
      <div className="screen-content org-content">
        {failed && !species && (
          <Banner tone="danger" title="Couldn't load the species">
            Check your signal and go back to try again.
          </Banner>
        )}
        {added && (
          <Banner tone="success" title="Added">
            {added.name} can now be chosen for a new tournament.
          </Banner>
        )}
        {problem && (
          <Banner tone="danger" title="Not added">
            {problem}
          </Banner>
        )}
        {species && (
          <ul className="species-list t-body" aria-label="Species">
            {species.map((item) => (
              <li key={item.id}>{item.name}</li>
            ))}
          </ul>
        )}
        <Note icon="/icons/lock-secondary-24.svg">Species can't be renamed or removed, so check the spelling before adding.</Note>
        <section className="org-section" aria-labelledby="add-species-heading">
          <h2 id="add-species-heading" className="t-title-section">
            Add a species
          </h2>
          <form
            className="species-add"
            onSubmit={(event) => {
              event.preventDefault();
              void add();
            }}
          >
            <TextField id="new-species" label="New species" help="For example: Walleye" error={error} value={name} autoComplete="off" onValueChange={setName} />
            <Button variant="primary" type="submit" full icon="/icons/plus-on-primary.svg" loading={sending} loadingLabel="Adding…" disabled={name.trim() === ""}>
              Add species
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
