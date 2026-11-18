// S4 step 8: the results and audit CSVs and their SHA-256 (web/src/lib/exports.ts; ORG-07a, the
// ORG-01d preview; decisions.md 2026-10-05 "Results and audit CSV format", 2026-11-17 "Export
// columns"). Pure checks of the format, then both files built from a tournament taken to final
// through the API, against the fixture world.

import { createHash, randomUUID } from "node:crypto";
import type { RecordModel } from "pocketbase";
import { beforeAll, describe, expect, it } from "vitest";
import { AUDIT_HEADER, auditCsv, buildExports, exportFileName, hashGroups, loadExportData, resultsCsv, sha256Hex, toCsv } from "../web/src/lib/exports";
import { leaderboardFromRecords } from "../web/src/lib/leaderboard";
import { usePocketBase } from "./harness/pocketbase";
import { actAs, createFixtureUsers, type FixtureName, type FixtureUsers } from "./harness/users";
import { photo, seedWorld, type World } from "./harness/world";

const lb = (pounds: number) => Math.round(pounds * 1600);
const rec = (fields: Record<string, unknown>) => fields as unknown as RecordModel;

describe("CSV format (pure)", () => {
  it("has a header, LF after every line, no BOM, and RFC 4180 quoting only where needed", () => {
    const text = toCsv(["a", "b"], [["plain", 'say "hi", then go'], ["two\nlines", ""]]);
    expect(text).toBe('a,b\nplain,"say ""hi"", then go"\n"two\nlines",\n');
    expect(text.charCodeAt(0)).not.toBe(0xfeff);
    expect(text).not.toContain("\r");
  });

  it("scoring.md example 1: A's best 10 total 27.15 lb = 43,440 hoz, raw and readable", () => {
    const fish = [2.1, 3.45, 1.2, 4.02, 2.88, 1.75, 3.1, 2.4, 0.95, 1.6, 2.05, 3.8];
    const csv = resultsCsv({
      event: { metric: "weight" },
      entries: [rec({ id: "ea", angler: "ua", display_name: "Angler A", withdrawn: false })],
      catches: fish.map((pounds, i) => rec({ id: `c${i}`, entry: "ea", status: "verified", weight_hoz: lb(pounds), expand: { species: { name: "largemouth bass" } } })),
    });
    expect(csv).toBe(
      "place,angler_id,display_name,counted_fish,total_hoz,total_lb,biggest_hoz,biggest_lb,biggest_species\n" +
        "1,ua,Angler A,10,43440,27.15,6432,4.02,largemouth bass\n",
    );
  });

  it("scoring.md example 11: shared places skip the next, sorted by place then name; withdrawn, pending-only and quoted names", () => {
    const entry = (id: string, name: string, withdrawn = false) => rec({ id, angler: `u${id}`, display_name: name, withdrawn });
    const verified = (id: string, entryId: string, pounds: number) => rec({ id, entry: entryId, status: "verified", weight_hoz: lb(pounds), expand: { species: { name: "smallmouth bass" } } });
    const csv = resultsCsv({
      event: { metric: "weight" },
      entries: [entry("k", "K"), entry("j", "J, the second"), entry("i", "I"), entry("l", "L"), entry("p", "P", true), entry("q", "Q pending")],
      catches: [
        verified("1", "k", 9), verified("2", "i", 3), verified("3", "i", 2), verified("4", "j", 2), verified("5", "j", 3), verified("6", "l", 4),
        verified("7", "p", 20), rec({ id: "8", entry: "q", status: "pending", weight_hoz: lb(5) }),
        rec({ id: "9", entry: "l", status: "rejected", weight_hoz: lb(30) }),
      ],
    });
    const lines = csv.trimEnd().split("\n").slice(1).map((line) => line.split(",")[0] + " " + line.split(",")[2]);
    // K 1st; I and J share 2nd (I before "J, the second" by name); L 4th; Q has nothing verified, 6th... after L.
    expect(lines).toEqual(["1 K", "2 I", '2 "J', "4 L", "5 Q pending"]);
    expect(csv).toContain('"J, the second"');
    expect(csv).not.toContain(",P,");
    // Q has only a pending catch: on the board with nothing counted.
    expect(csv).toContain("5,uq,Q pending,0,0,0.00,,,\n");
  });

  it("a shared place is ordered by display_name, whatever the entry ids", () => {
    const csv = resultsCsv({
      event: { metric: "weight" },
      entries: [rec({ id: "a1", angler: "u1", display_name: "Zed", withdrawn: false }), rec({ id: "b2", angler: "u2", display_name: "Amy", withdrawn: false })],
      catches: [rec({ id: "c1", entry: "a1", status: "verified", weight_hoz: 1600 }), rec({ id: "c2", entry: "b2", status: "verified", weight_hoz: 1600 })],
    });
    expect(csv.trimEnd().split("\n").slice(1).map((line) => line.split(",").slice(0, 3).join(" "))).toEqual(["1 u2 Amy", "1 u1 Zed"]);
  });

  it("length tournaments: quarter inches raw and inches to 0.25 (scoring.md example 6)", () => {
    const csv = resultsCsv({
      event: { metric: "length" },
      entries: [rec({ id: "e", angler: "u", display_name: "N", withdrawn: false })],
      catches: [rec({ id: "c1", entry: "e", status: "verified", length_q: 70 }), rec({ id: "c2", entry: "e", status: "verified", length_q: 59 })],
    });
    expect(csv).toBe("place,angler_id,display_name,counted_fish,total_q,total_in,biggest_q,biggest_in,biggest_species\n1,u,N,2,129,32.25,70,17.50,\n");
  });

  it("audit: one line per row by created then id, ISO times, the kind's snapshot fields only, JSON lists", () => {
    const rows = [
      rec({ id: "b2", created: "2027-07-04 10:00:00.000Z", action: "approve", actor: "uk", event: "ev", catch: "c1", target_id: "c1", before: { status: "pending", flags: [], photo: ["a.jpg", "b.jpg"], rev: 1 }, after: { status: "verified", flags: [], photo: ["a.jpg", "b.jpg"], rev: 2 } }),
      rec({ id: "a1", created: "2027-07-04 10:00:00.000Z", action: "open", actor: "uk", event: "ev", catch: "", target_id: "ev", before: { status: "draft", ends_at: "2027-08-15 00:00:00.000Z", species: ["s1", "s2"] }, after: { status: "live", ends_at: "2027-08-15 00:00:00.000Z", species: ["s1", "s2"] } }),
      rec({ id: "a0", created: "2027-07-01 09:00:00.000Z", action: "join", actor: "um", event: "ev", catch: "", target_id: "en", before: null, after: { withdrawn: false, withdraw_reason: "", withdrawn_by: "" } }),
    ];
    const csv = auditCsv(rows);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe(AUDIT_HEADER.join(","));
    expect(lines.map((line) => line.split(",")[0])).toEqual(["id", "a0", "a1", "b2"]);
    const at = (line: string, column: string) => {
      const cells: string[] = [];
      let rest = line;
      while (rest.length > 0) {
        const quoted = /^"((?:[^"]|"")*)"(?:,|$)/.exec(rest);
        const plain = /^([^,]*)(?:,|$)/.exec(rest)!;
        const match = quoted ?? plain;
        cells.push(quoted ? quoted[1]!.replace(/""/g, '"') : match[1]!);
        rest = rest.slice(match[0].length);
        if (match[0].endsWith(",") && rest.length === 0) cells.push("");
      }
      return cells[AUDIT_HEADER.indexOf(column)];
    };
    expect(at(lines[1]!, "created")).toBe("2027-07-01T09:00:00.000Z");
    expect(at(lines[1]!, "before_withdrawn")).toBe("");
    expect(at(lines[1]!, "after_withdrawn")).toBe("false");
    expect(at(lines[2]!, "after_ends_at")).toBe("2027-08-15T00:00:00.000Z");
    expect(at(lines[2]!, "after_species")).toBe('["s1","s2"]');
    expect(at(lines[2]!, "after_photo")).toBe("");
    expect(at(lines[3]!, "after_photo")).toBe('["a.jpg","b.jpg"]');
    expect(at(lines[3]!, "after_rev")).toBe("2");
  });

  it("the same data gives the same text and the same SHA-256, whatever the input order", async () => {
    const a = rec({ id: "a", created: "2027-07-01 09:00:00.000Z", action: "join", actor: "u", event: "e", catch: "", target_id: "x", before: null, after: { withdrawn: false, withdraw_reason: "", withdrawn_by: "" } });
    const b = rec({ id: "b", created: "2027-07-02 09:00:00.000Z", action: "join", actor: "v", event: "e", catch: "", target_id: "y", before: null, after: { withdrawn_by: "", withdraw_reason: "", withdrawn: false } });
    const one = auditCsv([a, b]);
    expect(auditCsv([b, a])).toBe(one);
    expect(await sha256Hex(one)).toBe(await sha256Hex(auditCsv([b, a])));
  });

  it("SHA-256 is of the UTF-8 bytes: a known vector, and 8 groups of 8 for display", async () => {
    const hex = await sha256Hex("abc");
    expect(hex).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashGroups(hex)).toEqual(["ba7816bf", "8f01cfea", "414140de", "5dae2223", "b00361a3", "96177a9c", "b410ff61", "f20015ad"]);
    // Non-ASCII names hash as UTF-8, the bytes the file is shared or downloaded as.
    expect(await sha256Hex("Sébastien, Été\n")).toBe(createHash("sha256").update(Buffer.from("Sébastien, Été\n", "utf8")).digest("hex"));
  });

  it.each([
    ["Summer Bass 2027", "results", "summer-bass-2027-results.csv"],
    ["Fall Walleye — 2027!", "audit", "fall-walleye-2027-audit.csv"],
    ["Été", "results", "ete-results.csv"],
    ["***", "audit", "tournament-audit.csv"],
  ] as const)("file name for %j (%s)", (name, kind, expected) => {
    expect(exportFileName(name, kind)).toBe(expected);
  });
});

describe("built from a tournament taken to final through the API", () => {
  const pocketbase = usePocketBase();
  let users: FixtureUsers;
  let world: World;
  let eventId: string;

  const as = (who: FixtureName) => actAs(pocketbase(), users[who]);

  beforeAll(async () => {
    users = await createFixtureUsers(pocketbase());
    world = await seedWorld(pocketbase(), users);
    const { superuser } = pocketbase();
    const k = await as("K");
    const now = Date.now();

    // K creates and opens it (join rows for K and N, an open row), M and Y join.
    const event = await k.collection("events").create({
      name: `Export Bass ${randomUUID().slice(0, 6)}`,
      status: "draft",
      starts_at: new Date(now - 10 * 86_400_000).toISOString(),
      ends_at: new Date(now + 10 * 86_400_000).toISOString(),
      metric: "weight",
      best_n: 10,
      judge: users.K.id,
      backup_judge: users.N.id,
      species: [world.species.largemouth.id, world.species.smallmouth.id],
    });
    eventId = event.id;
    await k.collection("events").update(eventId, { status: "live" });
    const entries: Partial<Record<FixtureName, RecordModel>> = {};
    for (const who of ["M", "Y"] as const) entries[who] = await (await as(who)).collection("entries").create({ event: eventId, angler: users[who].id });

    // Catches, as the superuser writes them (each still gets its create row), then judged by K.
    const photos = [await photo("clean-1.jpg"), await photo("clean-2.jpg")];
    const at = new Date(now - 86_400_000).toISOString();
    const make = async (who: "M" | "Y", hoz: number, status = "pending") =>
      superuser.collection("catches").create({
        entry: entries[who]!.id, species: world.species.largemouth.id, weight_hoz: hoz, photo: photos,
        captured_at: at, photo_captured_at: [at, at], client_uuid: randomUUID(), rev: 1, status, flags: [],
      });
    const mFish = await make("M", 5500);
    const yFish = await make("Y", 4800);
    await make("Y", 3000, "retracted");
    await k.collection("catches").update(mFish.id, { status: "verified", rev: mFish.rev });
    await k.collection("catches").update(yFish.id, { status: "rejected", reason: "Readout not legible", rev: yFish.rev });

    // The deadline is moved into the past by the superuser (a test shortcut), then K closes and finalizes.
    await superuser.collection("events").update(eventId, { submit_deadline: new Date(now - 60_000).toISOString() });
    await k.collection("events").update(eventId, { status: "closed" });
    await k.collection("events").update(eventId, { status: "final" });
  });

  it("the results match the leaderboard's standings for the same event", async () => {
    const data = await loadExportData(await as("K"), eventId);
    const files = await buildExports(data);
    const board = leaderboardFromRecords({ event: data.event, entries: data.entries, catches: data.catches, viewerId: users.K.id, units: "lb", nowMs: Date.now() });

    const lines = files.results.text.trimEnd().split("\n").slice(1).map((line) => line.split(","));
    expect(lines.map((cells) => [Number(cells[0]), cells[2], cells[5]])).toEqual(board.view.rows.map((row) => [row.place, row.displayName, row.total]));
    expect(lines).toEqual([["1", users.M.id, users.M.name, "1", "5500", "3.44", "5500", "3.44", "largemouth bass"]]);
    expect(files.results.rows).toBe(1);
  });

  it("the audit CSV has one line per audit row of the event: joins, open, creates, decisions, close, finalize", async () => {
    const data = await loadExportData(await as("K"), eventId);
    const files = await buildExports(data);
    const actions = files.audit.text.trimEnd().split("\n").slice(1).map((line) => line.split(",")[2]);

    expect(files.audit.rows).toBe(data.auditRows.length);
    expect(actions).toHaveLength(data.auditRows.length);
    expect([...actions].sort()).toEqual(["approve", "close", "create", "create", "create", "finalize", "join", "join", "join", "join", "open", "reject"].sort());
    expect(actions.at(-1)).toBe("finalize");
  });

  it("two builds give the same files and hashes, and the names follow the event", async () => {
    const first = await buildExports(await loadExportData(await as("K"), eventId));
    const second = await buildExports(await loadExportData(await as("K"), eventId));
    expect(second.results.sha256).toBe(first.results.sha256);
    expect(second.audit.sha256).toBe(first.audit.sha256);
    expect(first.audit.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.results.fileName).toMatch(/^export-bass-[0-9a-f]{6}-results\.csv$/);
  });
});
