// EVT-01 Tournaments (web/src/lib/tournaments.ts), opening any tournament (liveTournament.ts
// loadTournament and the status-aware can* checks), and "Photo archived" (S4 step 9): on a final
// event no loader asks for a file token or builds a photo URL. Against the fixture world.

import { describe, beforeAll, expect, it } from "vitest";
import type PocketBase from "pocketbase";
import { loadAnglerCatches } from "../web/src/lib/loadAnglerCatches";
import { loadMyCatches } from "../web/src/lib/loadMyCatches";
import { loadReview } from "../web/src/lib/judgeReview";
import { canJoin, canRejoin, canSubmit, canWithdraw, loadTournament } from "../web/src/lib/liveTournament";
import { loadTournaments, tournamentsFromRecords } from "../web/src/lib/tournaments";
import { usePocketBase } from "./harness/pocketbase";
import { statusOf } from "./harness/requests";
import { actAs, createFixtureUsers, type FixtureName, type FixtureUsers } from "./harness/users";
import { catchOf, entryOf, seedWorld, type World } from "./harness/world";

const pocketbase = usePocketBase();

let users: FixtureUsers;
let world: World;

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
  world = await seedWorld(pocketbase(), users);
});

const as = (who: FixtureName) => actAs(pocketbase(), users[who]);
const names = (cards: { name: string }[]) => cards.map((card) => card.name);

/** Counts the file-token requests a client makes. */
function countTokens(client: PocketBase): () => number {
  let calls = 0;
  const original = client.files.getToken.bind(client.files);
  client.files.getToken = (...args) => {
    calls++;
    return original(...args);
  };
  return () => calls;
}

describe("EVT-01 Tournaments", () => {
  it("M sees Live now and Past, no drafts", async () => {
    const data = await loadTournaments(await as("M"), users.M.id, "lb");
    expect(names(data.live)).toEqual(["E1 Spring Bass", "E2 Second Live", "EL Length Live"]);
    expect(data.drafts).toEqual([]);
    expect(names(data.past)).toEqual(["EC Closed", "EF Final"]);
    expect(data.past.map((card) => card.status)).toEqual(["closed", "final"]);
  });

  it("K also sees ED under Drafts, and the species count", async () => {
    const data = await loadTournaments(await as("K"), users.K.id, "lb");
    expect(data.drafts).toEqual([expect.objectContaining({ name: "ED Draft", status: "draft", entry: "Not open yet · only you can see it" })]);
    expect(data.speciesCount).toBe(3);
  });

  it("each card says where the viewer stands", async () => {
    const m = await loadTournaments(await as("M"), users.M.id, "lb");
    const e1 = m.live.find((card) => card.name === "E1 Spring Bass");
    expect(e1?.entry).toMatch(/^You're (\d+(st|nd|rd|th)|T-\d+) · \d+\.\d\d lb · 1 of 10 counted$/);
    expect(m.live.find((card) => card.name === "E2 Second Live")?.entry).toBe("Not joined yet");
    expect(m.past.find((card) => card.name === "EF Final")?.entry).toBe("Final results");

    const w = await loadTournaments(await as("W"), users.W.id, "lb");
    expect(w.live.find((card) => card.name === "E1 Spring Bass")?.entry).toBe("Withdrawn by the organizer");

    const k = await loadTournaments(await as("K"), users.K.id, "lb");
    expect(k.live.find((card) => card.name === "E1 Spring Bass")?.entry).toMatch(/^Judge · you're /);
    expect(k.past.find((card) => card.name === "EF Final")?.entry).toMatch(/^You finished /);
  });

  it("dates: live and drafts by weekday; past ones with the year; a draft without dates says so", () => {
    const event = (fields: Record<string, unknown>) => ({ id: String(fields.name), collectionId: "", collectionName: "events", metric: "weight", best_n: 10, ...fields });
    const data = tournamentsFromRecords({
      viewerId: "k",
      units: "lb",
      entries: [],
      catches: [],
      speciesCount: 2,
      events: [
        event({ name: "Summer Bass 2027", status: "live", starts_at: "2027-07-04 10:00:00.000Z", ends_at: "2027-08-16 00:00:00.000Z" }),
        event({ name: "Fall Walleye 2027", status: "draft", metric: "length", starts_at: "", ends_at: "" }),
        event({ name: "Fall Bass 2026", status: "final", metric: "length", starts_at: "2026-09-06 10:00:00.000Z", ends_at: "2026-10-18 23:00:00.000Z" }),
      ],
    });
    expect(data.live[0]?.dates).toBe("Sun, Jul 4 – Sun, Aug 15 · Weight · best 10");
    expect(data.drafts[0]?.dates).toBe("Dates not set · Length · best 10");
    expect(data.past[0]?.dates).toBe("Sep 6 – Oct 18, 2026 · Length · best 10");
  });
});

describe("opening any tournament", () => {
  it("loads EC and EF with their status; ED for K; M can't open ED", async () => {
    const m = await as("M");
    expect((await loadTournament(m, users.M.id, world.events.EC.id))?.status).toBe("closed");
    expect((await loadTournament(m, users.M.id, world.events.EF.id))?.status).toBe("final");
    expect((await loadTournament(await as("K"), users.K.id, world.events.ED.id))?.status).toBe("draft");
    await expect(loadTournament(m, users.M.id, world.events.ED.id)).rejects.toMatchObject({ status: 404 });
    // No id: the first live one, as before.
    expect((await loadTournament(m, users.M.id, null))?.submit.eventId).toBe(world.events.E1.id);
  });

  it("Join, Submit and Rejoin only on a live event; Withdraw until final (the API agrees)", async () => {
    const now = Date.now();
    const x = await as("X");
    const ec = await loadTournament(x, users.X.id, world.events.EC.id);
    const ef = await loadTournament(await as("N"), users.N.id, world.events.EF.id);
    const ecN = await loadTournament(await as("N"), users.N.id, world.events.EC.id);
    if (!ec || !ef || !ecN) throw new Error("not loaded");

    expect(canJoin(ec, now)).toBe(false);
    // Status alone decides: a draft or closed event whose deadline is still ahead offers no Join or Submit.
    const e1 = await loadTournament(x, users.X.id, world.events.E1.id);
    const e1M = await loadTournament(await as("M"), users.M.id, world.events.E1.id);
    if (!e1 || !e1M) throw new Error("not loaded");
    expect(canJoin(e1, now)).toBe(true);
    expect(canJoin({ ...e1, status: "closed" }, now)).toBe(false);
    expect(canJoin({ ...e1, status: "draft" }, now)).toBe(false);
    expect(canSubmit(e1M, now)).toBe(true);
    expect(canSubmit({ ...e1M, status: "closed" }, now)).toBe(false);
    expect(canWithdraw({ ...e1M, status: "final" })).toBe(false);
    expect(await statusOf(x.collection("entries").create({ event: world.events.EC.id, angler: users.X.id }))).toBe(400);
    expect(canSubmit(ecN, now)).toBe(false);
    expect(canWithdraw(ecN)).toBe(true);
    expect(canWithdraw(ef)).toBe(false);
    expect(canRejoin({ ...ecN, entry: { kind: "withdrawn", id: "e", bySelf: true, reason: "" } }, now)).toBe(false);
  });
});

describe("Photo archived (S4 step 9)", () => {
  it("My catches on EF: no file token and no photo URL; the catches still list", async () => {
    const n = await as("N");
    const tokens = countTokens(n);
    const tournament = await loadTournament(n, users.N.id, world.events.EF.id);
    if (!tournament) throw new Error("not loaded");
    const data = await loadMyCatches(n, tournament, users.N.id, "lb", Date.now());

    expect(data.context.phase).toBe("final");
    expect(data.catches.length).toBeGreaterThan(0);
    expect(data.catches.flatMap((item) => item.photos.map((photo) => photo.url))).toEqual(data.catches.flatMap((item) => item.photos.map(() => "")));
    expect(tokens()).toBe(0);
  });

  it("an angler's page on EF: final, no token, no URL", async () => {
    const m = await as("M");
    const tokens = countTokens(m);
    const data = await loadAnglerCatches(m, entryOf(world, "EF.N").id, users.M.id, "lb");
    expect(data.final).toBe(true);
    expect(data.catches.flatMap((item) => item.photos.map((photo) => photo.url)).every((url) => url === "")).toBe(true);
    expect(tokens()).toBe(0);
  });

  it("the judge's review of an EF catch: no token, no URL", async () => {
    const k = await as("K");
    const tokens = countTokens(k);
    const review = await loadReview(k, catchOf(world, "EF.N.verified").id, users.K.id, "lb");
    expect(review.photos.every((photo) => photo.url === "")).toBe(true);
    expect(tokens()).toBe(0);
  });

  it("a live event still gets its photos (E1)", async () => {
    const m = await as("M");
    const tokens = countTokens(m);
    const data = await loadAnglerCatches(m, entryOf(world, "E1.Y").id, users.M.id, "lb");
    expect(data.final).toBe(false);
    expect(data.catches[0]?.photos[0]?.url).toMatch(/token=/);
    expect(tokens()).toBe(1);
  });
});
