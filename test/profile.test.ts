// web/src/lib/profile.ts: the checks on the Profile fields, the words for each outcome, and the
// save and retry run against a real PocketBase (the users update rule, R-USR-U-01 and U-07).

import PocketBase from "pocketbase";
import { describe, expect, it } from "vitest";
import {
  PROFILE_COPY,
  draftNameError,
  hasChanges,
  holdsChanges,
  initials,
  profileChanges,
  retrySave,
  roleLabel,
  savedNotice,
  savedProfile,
  saveProfile,
  unitsOf,
} from "../web/src/lib/profile";
import { usePocketBase } from "./harness/pocketbase";
import { actAs, newUser } from "./harness/users";

const pocketbase = usePocketBase();

async function member(name = "Dana Ruiz") {
  return pocketbase().superuser.collection("users").create(newUser({ name, emailVisibility: false, verified: true }));
}

/** A client whose requests get no reply, as on a phone with no signal. */
function unreachable(): PocketBase {
  const client = new PocketBase("http://127.0.0.1:1");
  client.autoCancellation(false);
  return client;
}

describe("the Profile fields", () => {
  const saved = { name: "Kayden R.", units: "lb" as const };

  it("reads an empty display_units as lb", () => {
    expect(unitsOf({ display_units: "" })).toBe("lb");
    expect(unitsOf({ display_units: "lb_oz" })).toBe("lb_oz");
    expect(savedProfile({ name: "Kayden R.", display_units: "" })).toEqual(saved);
  });

  it("sends only what changed, with the name tidied to single spaces", () => {
    expect(profileChanges(saved, saved)).toEqual({});
    expect(profileChanges(saved, { name: "  Kayden   R. ", units: "lb" })).toEqual({});
    expect(profileChanges(saved, { name: "Kayden Ruiz", units: "lb" })).toEqual({ name: "Kayden Ruiz" });
    expect(profileChanges(saved, { name: "Kayden R.", units: "lb_oz" })).toEqual({ display_units: "lb_oz" });
    expect(hasChanges({})).toBe(false);
    expect(hasChanges({ display_units: "lb_oz" })).toBe(true);
  });

  it("refuses a blank name before anything is sent", () => {
    expect(draftNameError("Kayden R.")).toBeNull();
    expect(draftNameError("   ")).toBe(PROFILE_COPY.nameRefused);
    expect(draftNameError("")).toBe(PROFILE_COPY.nameRefused);
  });

  it("makes the monogram from the first and last words", () => {
    expect([initials("Kayden R."), initials("dana"), initials("Mary Jo Smith"), initials("  ")]).toEqual(["KR", "DA", "MS", ""]);
  });

  it("names the role", () => {
    expect([roleLabel("organizer"), roleLabel("member"), roleLabel(undefined)]).toEqual(["Organizer", "Member", "Member"]);
  });

  it("explains the one surprising case after a name change, and only says what units show for a units change", () => {
    expect(savedNotice({ name: "Kayden Ruiz" }, "lb")).toEqual({ title: "Name saved", message: PROFILE_COPY.nameSavedMessage });
    expect(PROFILE_COPY.nameSavedMessage).toBe("Your board name updates in live and closed tournaments. Final results keep the name they were published with.");
    expect(savedNotice({ display_units: "lb_oz" }, "lb_oz")).toEqual({ title: "Saved", message: "Weights now show as pounds and ounces." });
    expect(savedNotice({ name: "New Name", display_units: "lb_oz" }, "lb_oz").title).toBe("Name saved");
  });

  it("knows whether a record already holds the changes", () => {
    expect(holdsChanges({ name: "A B", display_units: "lb_oz" }, { name: "A B", display_units: "lb_oz" })).toBe(true);
    expect(holdsChanges({ name: "A B", display_units: "" }, { display_units: "lb" })).toBe(true);
    expect(holdsChanges({ name: "A B", display_units: "" }, { name: "C D" })).toBe(false);
  });
});

describe("saving", () => {
  it("R-USR-U-01: saves the name and units, and the client's session shows them", async () => {
    const dana = await member();
    const client = await actAs(pocketbase(), dana);

    const outcome = await saveProfile(client, dana.id, { name: "Dana R.", display_units: "lb_oz" });

    expect(outcome.kind).toBe("saved");
    expect(outcome.kind === "saved" && outcome.user).toMatchObject({ name: "Dana R.", display_units: "lb_oz" });
    expect(await pocketbase().superuser.collection("users").getOne(dana.id)).toMatchObject({ name: "Dana R.", display_units: "lb_oz" });
    expect(client.authStore.record).toMatchObject({ name: "Dana R.", display_units: "lb_oz" });
  });

  it("R-USR-U-07: says the name was refused when the server refuses it", async () => {
    const dana = await member();

    expect(await saveProfile(await actAs(pocketbase(), dana), dana.id, { name: "Dana  R." })).toEqual({ kind: "name-refused" });
    expect((await pocketbase().superuser.collection("users").getOne(dana.id)).name).toBe("Dana Ruiz");
  });

  it("says NOT SENT when there is no reply", async () => {
    const dana = await member();

    expect(await saveProfile(unreachable(), dana.id, { name: "Dana R." })).toEqual({ kind: "not-sent" });
  });
});

describe("Retry after NOT SENT", () => {
  it("reads the change as saved, and sends nothing again, when it had already landed", async () => {
    const dana = await member();
    const client = await actAs(pocketbase(), dana);
    const changes = { name: "Dana R.", display_units: "lb_oz" as const };
    // The change lands, but its reply is lost: the screen shows NOT SENT.
    await pocketbase().superuser.collection("users").update(dana.id, changes);
    const landed = await pocketbase().superuser.collection("users").getOne(dana.id);

    const outcome = await retrySave(client, dana.id, changes);

    expect(outcome.kind).toBe("saved");
    // Nothing was written: `updated` is the superuser's.
    expect((await pocketbase().superuser.collection("users").getOne(dana.id)).updated).toBe(landed.updated);
  });

  it("sends the change when the reload shows it never landed", async () => {
    const dana = await member();
    const client = await actAs(pocketbase(), dana);

    const outcome = await retrySave(client, dana.id, { name: "Dana R." });

    expect(outcome.kind).toBe("saved");
    expect((await pocketbase().superuser.collection("users").getOne(dana.id)).name).toBe("Dana R.");
  });

  it("is NOT SENT again when the reload gets no reply", async () => {
    const dana = await member();

    expect(await retrySave(unreachable(), dana.id, { name: "Dana R." })).toEqual({ kind: "not-sent" });
  });
});
