// The schema the migrations build, read back from a PocketBase booted from an empty pb_data:
// every collection, field, option, index and rule, the species seed, and that anon and a
// signed-in member are refused wherever a rule is locked (an early form of R-ALL-ANON-01).

import { randomUUID } from "node:crypto";
import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { beforeAll, describe, expect, it } from "vitest";
import { usePocketBase } from "./harness/pocketbase";
import { refusedFields, statusOf } from "./harness/requests";
import { actAs, actAsAnon, createFixtureUsers, newUser, type FixtureUsers } from "./harness/users";

const pocketbase = usePocketBase();

const COLLECTIONS = ["users", "species", "events", "entries", "catches", "audit_log"] as const;
type CollectionName = (typeof COLLECTIONS)[number];

const RULE_NAMES = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"] as const;
type RuleName = (typeof RULE_NAMES)[number];

const LOCKED: Record<RuleName, null> = {
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

// The M0-03 read rules (migration 1794602178_open_live_reads.js): the security.md code blocks,
// line breaks and indentation included.
const SPECIES_READ = '@request.auth.id != ""';
const EVENTS_READ = ['@request.auth.id != "" &&', '(status != "draft" || @request.auth.role = "organizer")'].join("\n");
const ENTRIES_READ = [
  '@request.auth.id != "" &&',
  'event.status != "draft" &&',
  "(withdrawn = false ||",
  " angler = @request.auth.id ||",
  " event.judge = @request.auth.id ||",
  " (event.backup_judge = @request.auth.id && angler = event.judge) ||",
  ' @request.auth.role = "organizer")',
].join("\n");
// S1 step 1 (migration 1794693360_entries_join_rule.js): the security.md "entries" Create block.
const ENTRIES_CREATE = [
  '@request.auth.id != "" &&',
  "@request.body.angler = @request.auth.id &&",
  'event.status = "live" &&',
  "@now <= event.submit_deadline &&",
  "@request.body.display_name:isset = false &&",
  "@request.body.withdrawn:isset = false &&",
  "@request.body.withdraw_reason:isset = false &&",
  "@request.body.withdrawn_by:isset = false",
].join("\n");
const CATCHES_READ = [
  '@request.auth.id != "" &&',
  "(",
  '  (status != "rejected" && status != "retracted" && entry.withdrawn = false) ||',
  "  entry.angler = @request.auth.id ||",
  "  entry.event.judge = @request.auth.id ||",
  "  (entry.event.backup_judge = @request.auth.id && entry.angler = entry.event.judge) ||",
  '  @request.auth.role = "organizer"',
  ")",
].join("\n");

/**
 * Every API rule of every collection, in one table. null means superuser only.
 *
 * A later item that implements a docs/security.md row changes that row's expectation here
 * in the same commit, and names the row ID in the commit message. Nothing else in this file
 * has to change for it: the sweep at the bottom only tries the rules that are null here.
 */
const RULES: Record<CollectionName, Record<RuleName, string | null>> = {
  users: {
    ...LOCKED,
    // R-USR-C-01 (security.md v0.11): anon may sign up, as a member only.
    createRule:
      '@request.auth.id = "" && @request.body.role = "member" && ' +
      "@request.body.verified:isset = false && @request.body.emailVisibility:isset = false",
    // R-USR-U-01 to U-07 (security.md v0.12): a member updates their own record, never role,
    // email or verified.
    updateRule:
      '@request.auth.id != "" && id = @request.auth.id && @request.body.role:changed = false && ' +
      "@request.body.email:isset = false && @request.body.verified:isset = false",
  },
  // R-SPC-L-01 to L-03 (security.md v0.9 text; opened by M0-03, Kayden's call 2026-11-13).
  species: { ...LOCKED, listRule: SPECIES_READ, viewRule: SPECIES_READ },
  // R-EVT-L-01 to L-03, R-EVT-V-01 (security.md v0.9 text, line for line).
  events: { ...LOCKED, listRule: EVENTS_READ, viewRule: EVENTS_READ },
  // R-ENT-L-01 to L-06; R-ENT-C-01 to C-08 (self-join, S1 step 1).
  entries: { ...LOCKED, listRule: ENTRIES_READ, viewRule: ENTRIES_READ, createRule: ENTRIES_CREATE },
  // R-CAT-L-01 to L-08, L-10 to L-12, R-CAT-V-01.
  catches: { ...LOCKED, listRule: CATCHES_READ, viewRule: CATCHES_READ },
  audit_log: { ...LOCKED },
};

/** A field as the collections API returns it, less what the specs below don't state. */
type FieldSpec = { type: string; to?: CollectionName } & Record<string, unknown>;

const text = (max: number, required = false, pattern = ""): FieldSpec => ({ type: "text", required, max, min: 0, pattern });
const select = (values: string[], required = false): FieldSpec => ({ type: "select", required, maxSelect: 1, values });
const date = (): FieldSpec => ({ type: "date", required: false, min: "", max: "" });
const bool = (): FieldSpec => ({ type: "bool", required: false });
const json = (): FieldSpec => ({ type: "json", required: false, maxSize: 0 });
const int = (min: number, required = false): FieldSpec => ({ type: "number", required, onlyInt: true, min, max: null });
/** No relation cascades: nothing is deleted (SPEC invariant 6). `to` is checked by name. */
const relation = (to: CollectionName, required = false, maxSelect = 1): FieldSpec => ({
  type: "relation",
  to,
  required,
  maxSelect,
  minSelect: 0,
  cascadeDelete: false,
});
const createdDate = (): FieldSpec => ({ type: "autodate", onCreate: true, onUpdate: false });
const updatedDate = (): FieldSpec => ({ type: "autodate", onCreate: true, onUpdate: true });
/** PocketBase's own primary key, on every collection. */
const id = (): FieldSpec => ({ type: "text", system: true, required: true, primaryKey: true });

/** Words with one space between them: no empty name, no leading, trailing or doubled space. */
const NAME_PATTERN = "^[^\\s\\p{Z}]+( [^\\s\\p{Z}]+)*$";

const FIELDS: Record<CollectionName, Record<string, FieldSpec>> = {
  users: {
    id: id(),
    password: { type: "password", system: true, required: true, hidden: true },
    tokenKey: { type: "text", system: true, required: true, hidden: true },
    email: { type: "email", system: true, required: true },
    emailVisibility: { type: "bool", system: true, required: false },
    verified: { type: "bool", system: true, required: false },
    // Their board name, so never blank (decisions.md 2026-10-05).
    name: text(255, true, NAME_PATTERN),
    role: select(["member", "organizer"], true),
    display_units: select(["lb", "lb_oz"]),
    created: createdDate(),
    updated: updatedDate(),
  },
  species: {
    id: id(),
    name: text(60, true, NAME_PATTERN),
  },
  events: {
    id: id(),
    name: text(120, true),
    status: select(["draft", "live", "closed", "final"], true),
    starts_at: date(),
    ends_at: date(),
    deadline_ext_min: int(0),
    submit_deadline: date(),
    metric: select(["weight", "length"], true),
    best_n: int(1, true),
    judge: relation("users", true),
    backup_judge: relation("users"),
    species: relation("species", false, 50),
    code_word_on: bool(),
    code_word: text(40),
    code_word_prev: text(40),
    code_word_changed_at: date(),
  },
  entries: {
    id: id(),
    event: relation("events", true),
    angler: relation("users", true),
    display_name: text(255),
    withdrawn: bool(),
    withdraw_reason: text(500),
    withdrawn_by: relation("users"),
    created: createdDate(),
  },
  catches: {
    id: id(),
    entry: relation("entries", true),
    species: relation("species", true),
    weight_hoz: int(0),
    length_q: int(0),
    photo: {
      type: "file",
      required: false,
      protected: true,
      maxSelect: 4,
      maxSize: 5 * 1024 * 1024,
      mimeTypes: ["image/jpeg"],
      thumbs: [],
    },
    captured_at: date(),
    photo_captured_at: json(),
    client_uuid: text(64, true),
    rev: int(0),
    status: select(["pending", "verified", "rejected", "retracted"], true),
    judged_by: relation("users"),
    reason: text(500),
    flags: json(),
    created: createdDate(),
    updated: updatedDate(),
  },
  audit_log: {
    id: id(),
    // Empty means the superuser, who isn't a users record (R-EVT-U-19).
    actor: relation("users"),
    action: select(
      ["join", "withdraw", "rejoin", "create", "edit", "retract", "approve", "reject", "correct", "open", "close", "finalize", "event_edit"],
      true,
    ),
    event: relation("events", true),
    catch: relation("catches"),
    target_id: text(64, true),
    before: json(),
    after: json(),
    created: createdDate(),
  },
};

const INDEXES: Record<CollectionName, string[]> = {
  // PocketBase's own two, kept.
  users: [
    "CREATE UNIQUE INDEX `idx_tokenKey__pb_users_auth_` ON `users` (`tokenKey`)",
    "CREATE UNIQUE INDEX `idx_email__pb_users_auth_` ON `users` (`email`) WHERE `email` != ''",
  ],
  species: ["CREATE UNIQUE INDEX `idx_species_name` ON `species` (`name` COLLATE NOCASE)"],
  events: [],
  entries: ["CREATE UNIQUE INDEX `idx_entries_event_angler` ON `entries` (`event`, `angler`)"],
  catches: ["CREATE UNIQUE INDEX `idx_catches_client_uuid` ON `catches` (`client_uuid`)"],
  audit_log: [],
};

const SEEDED_SPECIES = ["largemouth bass", "smallmouth bass"];

interface StoredField {
  name: string;
  type: string;
  [option: string]: unknown;
}

interface StoredCollection {
  id: string;
  name: string;
  type: string;
  system: boolean;
  fields: StoredField[];
  indexes: string[];
  [option: string]: unknown;
}

/** What the tests act on: read and created once, through the superuser. */
interface World {
  collections: StoredCollection[];
  users: FixtureUsers;
  /** One record per collection, for view, update and delete to aim at. */
  seeded: Record<CollectionName, RecordModel>;
}

let world: World;

beforeAll(async () => {
  const { superuser } = pocketbase();
  const collections = (await superuser.collections.getFullList()) as unknown as StoredCollection[];
  const users = await createFixtureUsers(pocketbase());

  const species = await superuser.collection("species").getFirstListItem(`name = "${SEEDED_SPECIES[0]}"`);
  const event = await superuser.collection("events").create(newEvent(users));
  const entry = await superuser.collection("entries").create({ event: event.id, angler: users.M.id });
  const caught = await superuser.collection("catches").create({
    entry: entry.id,
    species: species.id,
    weight_hoz: 5500,
    client_uuid: randomUUID(),
    status: "pending",
  });
  const audit = await superuser.collection("audit_log").create({
    actor: users.M.id,
    action: "create",
    event: event.id,
    catch: caught.id,
    target_id: caught.id,
    after: { weight_hoz: 5500 },
  });

  world = {
    collections,
    users,
    // M's own record: a locked users collection refuses even that.
    seeded: { users: users.M, species, events: event, entries: entry, catches: caught, audit_log: audit },
  };
});

/** A draft with only what the schema requires. */
function newEvent(users: FixtureUsers): Record<string, unknown> {
  return { name: "Schema test", status: "draft", metric: "weight", best_n: 10, judge: users.K.id };
}

function stored(name: CollectionName): StoredCollection {
  const collection = world.collections.find((candidate) => candidate.name === name);
  if (collection === undefined) throw new Error(`no ${name} collection`);
  return collection;
}

describe("collections", () => {
  it("are users, species, events, entries, catches and audit_log, and no others", () => {
    const names = world.collections.filter((collection) => !collection.system).map((collection) => collection.name);

    expect(names.sort()).toEqual([...COLLECTIONS].sort());
    expect(stored("users").type).toBe("auth");
    for (const name of COLLECTIONS) {
      if (name !== "users") expect(stored(name).type, name).toBe("base");
    }
  });

  describe.each(COLLECTIONS)("%s", (name) => {
    it("has exactly its fields", () => {
      const names = stored(name).fields.map((field) => field.name);

      expect(names.sort()).toEqual(Object.keys(FIELDS[name]).sort());
    });

    it.each(Object.entries(FIELDS[name]))("field %s has its type and options", (fieldName, spec) => {
      const field = stored(name).fields.find((candidate) => candidate.name === fieldName);
      const { to, ...options } = spec;

      expect(field).toMatchObject(to === undefined ? options : { ...options, collectionId: stored(to).id });
    });

    it("has exactly its indexes", () => {
      expect(stored(name).indexes).toEqual(INDEXES[name]);
    });

    it("has every API rule as the rules table says", () => {
      const rules = Object.fromEntries(RULE_NAMES.map((rule) => [rule, stored(name)[rule]]));

      expect(rules).toEqual(RULES[name]);
    });
  });
});

describe("users", () => {
  it("can't be managed by anyone but the superuser, and still lets its members authenticate", () => {
    expect(stored("users").manageRule).toBeNull();
    // Not an API rule: null here would switch off every sign-in, OTP included.
    expect(stored("users").authRule).toBe("");
  });

  it("signs in by OTP only: an 8-digit code for 10 minutes, a 14-day token, no password, no OAuth2", async () => {
    const users = stored("users");

    expect(users.otp).toMatchObject({ enabled: true, length: 8, duration: 600 });
    expect(users.authToken).toMatchObject({ duration: 14 * 24 * 60 * 60 });
    expect(users.passwordAuth).toMatchObject({ enabled: false });
    expect(users.oauth2).toMatchObject({ enabled: false, providers: [] });
    expect(users.mfa).toMatchObject({ enabled: false });

    // And what the server tells a browser that asks.
    const methods = await actAsAnon(pocketbase()).collection("users").listAuthMethods();
    expect(methods.otp.enabled).toBe(true);
    expect(methods.password.enabled).toBe(false);
    expect(methods.oauth2.enabled).toBe(false);
    expect(methods.mfa.enabled).toBe(false);
  });

  it("keeps a new member's email hidden and their units empty unless told otherwise", async () => {
    const user = await pocketbase().superuser.collection("users").create(newUser());

    expect(user.emailVisibility).toBe(false);
    // Empty reads as lb.
    expect(user.display_units).toBe("");
  });

  it("needs a role, and only member or organizer", async () => {
    const users = pocketbase().superuser.collection("users");

    expect(await refusedFields(users.create(newUser({ role: undefined })))).toEqual({ role: "validation_required" });
    expect(await refusedFields(users.create(newUser({ role: "judge" })))).toEqual({ role: "validation_invalid_value" });
  });

  it("needs a name: not left out at invite, and not cleared afterwards", async () => {
    const users = pocketbase().superuser.collection("users");

    expect(await refusedFields(users.create(newUser({ name: undefined })))).toEqual({ name: "validation_required" });
    expect(await refusedFields(users.create(newUser({ name: "" })))).toEqual({ name: "validation_required" });

    const member = await users.create(newUser({ name: "Angler Z" }));
    expect(await refusedFields(users.update(member.id, { name: "" }))).toEqual({ name: "validation_required" });
    expect((await users.getOne(member.id)).name).toBe("Angler Z");
  });

  it("needs a name of words with one space between them, so never one that is only spaces", async () => {
    const users = pocketbase().superuser.collection("users");

    const spaced = [" ", "   ", " Angler Z", "Angler Z ", "Angler  Z", "Angler\tZ", "Angler\u00a0Z"];
    for (const name of spaced) {
      expect(await refusedFields(users.create(newUser({ name }))), JSON.stringify(name)).toEqual({
        name: "validation_invalid_format",
      });
    }

    // Not by a rename either, and a real name with one space still saves.
    const member = await users.create(newUser({ name: "Mary Ann O'Neil-Smith" }));
    expect(await refusedFields(users.update(member.id, { name: " " }))).toEqual({ name: "validation_invalid_format" });
    expect((await users.getOne(member.id)).name).toBe("Mary Ann O'Neil-Smith");
  });

  it("takes only lb or lb_oz as display units", async () => {
    const users = pocketbase().superuser.collection("users");

    expect((await users.create(newUser({ display_units: "lb_oz" }))).display_units).toBe("lb_oz");
    expect(await refusedFields(users.create(newUser({ display_units: "kg" })))).toEqual({
      display_units: "validation_invalid_value",
    });
  });
});

describe("events", () => {
  it("has no outage extension unless one is set", () => {
    expect(world.seeded.events.deadline_ext_min).toBe(0);
  });
});

describe("audit_log", () => {
  it("saves a row with no actor, which is how a superuser action is recorded", async () => {
    const { events } = world.seeded;

    const row = await pocketbase()
      .superuser.collection("audit_log")
      .create({ action: "event_edit", event: events.id, target_id: events.id });

    expect(row.actor).toBe("");
  });
});

describe("species", () => {
  it("is seeded with largemouth bass and smallmouth bass", async () => {
    const species = await pocketbase().superuser.collection("species").getFullList({ sort: "name" });

    expect(species.map((record) => record.name)).toEqual(SEEDED_SPECIES);
  });

  it("needs a name of words with one space between them", async () => {
    const species = pocketbase().superuser.collection("species");

    expect(await refusedFields(species.create({ name: "" }))).toEqual({ name: "validation_required" });
    // The first three would otherwise pass the unique index as new species (R-SPC-C-03).
    const spaced = ["largemouth bass ", " largemouth bass", "largemouth  bass", " ", "white\tbass", "white\u00a0bass"];
    for (const name of spaced) {
      expect(await refusedFields(species.create({ name })), JSON.stringify(name)).toEqual({ name: "validation_invalid_format" });
    }

    // One space between words is a name. Removed again: the tests below count the species.
    const made = await species.create({ name: "white bass" });
    await species.delete(made.id);
  });
});

describe("unique indexes", () => {
  it("refuse a second species of the same name, whatever its case", async () => {
    const species = pocketbase().superuser.collection("species");

    expect(await statusOf(species.create({ name: "largemouth bass" }))).toBe(400);
    expect(await statusOf(species.create({ name: "Largemouth Bass" }))).toBe(400);
    expect(await statusOf(species.create({ name: "SMALLMOUTH BASS" }))).toBe(400);

    expect((await species.getFullList()).length).toBe(SEEDED_SPECIES.length);
  });

  it("refuse a second entry for the same angler in the same event", async () => {
    const { events } = world.seeded;
    const entries = pocketbase().superuser.collection("entries");

    const again = entries.create({ event: events.id, angler: world.users.M.id });

    expect(await refusedFields(again)).toEqual({ event: "validation_not_unique", angler: "validation_not_unique" });
    // The same angler in another event, and another angler in the same one, are fine.
    const other = await pocketbase().superuser.collection("events").create(newEvent(world.users));
    expect(await statusOf(entries.create({ event: other.id, angler: world.users.M.id }))).toBe("allowed");
    expect(await statusOf(entries.create({ event: events.id, angler: world.users.Y.id }))).toBe("allowed");
  });

  it("refuse a second catch with the same client_uuid", async () => {
    const { catches } = world.seeded;

    const again = pocketbase().superuser.collection("catches").create({
      entry: catches.entry,
      species: catches.species,
      weight_hoz: 5500,
      client_uuid: catches.client_uuid,
      status: "pending",
    });

    expect(await refusedFields(again)).toEqual({ client_uuid: "validation_not_unique" });
  });
});

// Last in the file, so the counts it takes aren't moved by the tests above.
describe("locked rules", () => {
  /** A body the schema would accept, so a refusal is the rule's and not the validator's. */
  function createBody(name: CollectionName): Record<string, unknown> {
    const { events, entries, species } = world.seeded;
    switch (name) {
      case "users":
        return newUser();
      case "species":
        return { name: "walleye" };
      case "events":
        return newEvent(world.users);
      case "entries":
        return { event: events.id, angler: world.users.X.id };
      case "catches":
        return { entry: entries.id, species: species.id, weight_hoz: 4000, client_uuid: randomUUID(), status: "pending" };
      case "audit_log":
        return { actor: world.users.K.id, action: "event_edit", event: events.id, target_id: events.id };
    }
  }

  const UPDATE_BODY: Record<CollectionName, Record<string, unknown>> = {
    users: { name: "Changed" },
    species: { name: "changed" },
    events: { name: "Changed" },
    entries: { withdrawn: true },
    catches: { weight_hoz: 1 },
    audit_log: { target_id: "changed" },
  };

  const ATTEMPTS: Record<RuleName, (client: PocketBase, name: CollectionName) => Promise<unknown>> = {
    listRule: (client, name) => client.collection(name).getList(1, 10),
    viewRule: (client, name) => client.collection(name).getOne(world.seeded[name].id),
    createRule: (client, name) => client.collection(name).create(createBody(name)),
    updateRule: (client, name) => client.collection(name).update(world.seeded[name].id, UPDATE_BODY[name]),
    deleteRule: (client, name) => client.collection(name).delete(world.seeded[name].id),
  };

  const ACTION: Record<RuleName, string> = {
    listRule: "list",
    viewRule: "view",
    createRule: "create in",
    updateRule: "update",
    deleteRule: "delete from",
  };

  const lockedCells = COLLECTIONS.flatMap((name) =>
    RULE_NAMES.filter((rule) => RULES[name][rule] === null).map((rule) => ({ name, rule, action: ACTION[rule] })),
  );

  const CALLERS = {
    anon: async () => actAsAnon(pocketbase()),
    M: () => actAs(pocketbase(), world.users.M),
  };

  async function counts(): Promise<Record<string, number>> {
    const { superuser } = pocketbase();
    const totals = await Promise.all(
      COLLECTIONS.map(async (name) => [name, (await superuser.collection(name).getList(1, 1)).totalItems] as const),
    );
    return Object.fromEntries(totals);
  }

  let before: Record<string, number>;

  beforeAll(async () => {
    before = await counts();
  });

  describe.each(Object.entries(CALLERS))("%s", (_caller, signIn) => {
    // One sign-in per caller, not one per cell.
    let client: PocketBase;

    beforeAll(async () => {
      client = await signIn();
    });

    // While a rule is null PocketBase answers 403 before it looks anything up: never an
    // empty list, and never a 404.
    it.each(lockedCells)("may not $action $name", async ({ name, rule }) => {
      expect(await statusOf(ATTEMPTS[rule](client, name))).toBe(403);
    });
  });

  it("left every record as it was, and added none", async () => {
    const { superuser } = pocketbase();

    expect(await counts()).toEqual(before);
    for (const name of COLLECTIONS) {
      const seeded = world.seeded[name];
      expect(await superuser.collection(name).getOne(seeded.id), name).toMatchObject(seeded);
    }
  });
});
