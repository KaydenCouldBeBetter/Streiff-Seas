// M0-04 photo spike, questions 2 and 3: append-only before deletion, and the three rule
// mechanics (security.md open items 2 and 7), on the pinned binary.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newUser } from "./../harness/users";
import { asUser, catchForm, evidence, fixture, seed, startSpike, type Seed, type Spike } from "./spike";

interface Refusal { status: number; message: string; data: unknown }
async function refusal(run: () => Promise<unknown>): Promise<Refusal | "allowed"> {
  try {
    await run();
    return "allowed";
  } catch (error) {
    const e = error as { status: number; response: { message: string; data: unknown } };
    return { status: e.status, message: e.response.message, data: e.response.data };
  }
}

function addPhoto(rev: number, name: string, extra: Record<string, string> = {}): Promise<FormData> {
  return fixture(name).then((file) => {
    const form = new FormData();
    form.set("rev", String(rev));
    for (const [k, v] of Object.entries(extra)) form.set(k, v);
    form.append("photo+", file);
    return form;
  });
}

describe("append-only: the control, PocketBase with no guard hook", () => {
  let spike: Spike;
  let s: Seed;
  beforeAll(async () => {
    spike = await startSpike({ hooks: [], mimes: [], thumbs: [] });
    s = await seed(spike.harness);
  });
  afterAll(() => spike.stop());

  it("deletes a stored file when the update drops it", async () => {
    const m = await asUser(spike.harness, s.member);
    const created = await m.collection("catches").create(catchForm(s, [await fixture("clean-1.jpg"), await fixture("clean-2.jpg")]));
    const form = new FormData();
    form.set("rev", "1");
    form.set("photo-", created.photo[0]);
    const updated = await m.collection("catches").update(created.id, form);
    const left = (await spike.storage()).map((f) => f.path);
    evidence("append-only control: photo- with no hook", { before: created.photo, after: updated.photo, storage: left });
    expect(updated.photo).toEqual([created.photo[1]]);
    expect(left.some((p) => p.includes(created.photo[0]))).toBe(false);
  });
});

describe("append-only: the hook compares the lists before PocketBase saves or deletes", () => {
  let spike: Spike;
  let s: Seed;
  beforeAll(async () => {
    spike = await startSpike({ hooks: ["append_only.pb.js"], mimes: [], thumbs: [] });
    s = await seed(spike.harness);
  });
  afterAll(() => spike.stop());

  const attempts: [string, (names: string[]) => Promise<FormData>][] = [
    ["photo- of the first file", async (n) => { const f = new FormData(); f.set("rev", "1"); f.set("photo-", n[0]!); return f; }],
    ["photo- of both files", async (n) => { const f = new FormData(); f.set("rev", "1"); f.append("photo-", n[0]!); f.append("photo-", n[1]!); return f; }],
    ["a full photo list missing the first file, plus a new file", async (n) => { const f = new FormData(); f.set("rev", "1"); f.append("photo", n[1]!); f.append("photo", await fixture("clean-1.jpg")); return f; }],
    ["the two files in the other order", async (n) => { const f = new FormData(); f.set("rev", "1"); f.append("photo", n[1]!); f.append("photo", n[0]!); return f; }],
    ["a new file in place of the first (full list, new file first)", async (n) => { const f = new FormData(); f.set("rev", "1"); f.append("photo", await fixture("clean-1.jpg")); f.append("photo", n[1]!); return f; }],
    ["an empty photo list (clears the field)", async () => { const f = new FormData(); f.set("rev", "1"); f.set("photo", ""); return f; }],
  ];

  it.each(attempts)("refuses %s, deletes nothing, and the record is unchanged", async (label, build) => {
    const m = await asUser(spike.harness, s.member);
    const created = await m.collection("catches").create(catchForm(s, [await fixture("clean-1.jpg"), await fixture("clean-2.jpg")]));
    const before = await spike.storage();
    const result = await refusal(async () => m.collection("catches").update(created.id, await build(created.photo)));
    evidence(`append-only hook: ${label}`, { result, storageUnchanged: JSON.stringify(await spike.storage()) === JSON.stringify(before) });
    expect(result).not.toBe("allowed");
    expect((result as Refusal).status).toBe(400);
    expect(await spike.storage()).toEqual(before);
    expect((await m.collection("catches").getOne(created.id)).photo).toEqual(created.photo);
  });

  it("allows an added photo (photo+) and keeps the first two in place", async () => {
    const m = await asUser(spike.harness, s.member);
    const created = await m.collection("catches").create(catchForm(s, [await fixture("clean-1.jpg"), await fixture("clean-2.jpg")]));
    const updated = await m.collection("catches").update(created.id, await addPhoto(1, "clean-1.jpg"));
    expect(updated.photo.slice(0, 2)).toEqual(created.photo);
    expect(updated.photo).toHaveLength(3);
  });

  it("allows the same append written as a full list (old names in order, new file last)", async () => {
    const m = await asUser(spike.harness, s.member);
    const created = await m.collection("catches").create(catchForm(s, [await fixture("clean-1.jpg"), await fixture("clean-2.jpg")]));
    const f = new FormData();
    f.set("rev", "1");
    for (const n of created.photo) f.append("photo", n);
    f.append("photo", await fixture("clean-2.jpg"));
    const updated = await m.collection("catches").update(created.id, f);
    expect(updated.photo.slice(0, 2)).toEqual(created.photo);
    expect(updated.photo).toHaveLength(3);
  });

  it("an update that sends no photo field leaves the photos alone", async () => {
    const m = await asUser(spike.harness, s.member);
    const created = await m.collection("catches").create(catchForm(s, [await fixture("clean-1.jpg"), await fixture("clean-2.jpg")]));
    const updated = await m.collection("catches").update(created.id, { rev: 1, weight_hoz: 70 });
    expect(updated.photo).toEqual(created.photo);
  });
});

describe("what an update hook can see, and where a transaction starts", () => {
  let spike: Spike;
  let s: Seed;
  beforeAll(async () => {
    spike = await startSpike({ hooks: ["inspect.pb.js"], mimes: [], thumbs: [] });
    s = await seed(spike.harness);
  });
  afterAll(() => spike.stop());

  it("onRecordUpdateRequest sees the stored list and the new list, with modifiers applied, before anything is saved", async () => {
    const m = await asUser(spike.harness, s.member);
    const created = await m.collection("catches").create(catchForm(s, [await fixture("clean-1.jpg"), await fixture("clean-2.jpg")]));
    const names = created.photo as string[];
    const probe = async (build: (f: FormData) => Promise<void> | void) => {
      const f = new FormData();
      f.set("rev", "1");
      f.set("probe", "1");
      await build(f);
      return m.collection("catches").update(created.id, f) as unknown as Promise<{ now: string[]; unsaved: string[]; original: string[] }>;
    };
    const seen = {
      "photo+ (one new file)": await probe(async (f) => f.append("photo+", await fixture("gps.jpg"))),
      "photo- (first file)": await probe((f) => f.set("photo-", names[0]!)),
      "full list: second file + new file": await probe(async (f) => { f.append("photo", names[1]!); f.append("photo", await fixture("gps.jpg")); }),
      "full list, reordered": await probe((f) => { f.append("photo", names[1]!); f.append("photo", names[0]!); }),
    };
    evidence("update request hook: what it sees (stored names: " + names.join(", ") + ")", seen);
    expect(seen["photo+ (one new file)"].original).toEqual(names);
    expect(seen["photo+ (one new file)"].now.slice(0, 2)).toEqual(names);
    expect(seen["photo+ (one new file)"].unsaved).toHaveLength(1);
    expect(seen["photo- (first file)"].now).toEqual([names[1]]);
    expect(seen["full list, reordered"].now).toEqual([names[1], names[0]]);
    expect((await m.collection("catches").getOne(created.id)).photo).toEqual(names); // the probe saved nothing
  });

  it("none of the record update hooks runs inside a transaction", async () => {
    const m = await asUser(spike.harness, s.member);
    const created = await m.collection("catches").create(catchForm(s, [await fixture("clean-1.jpg"), await fixture("clean-2.jpg")]));
    const result = await refusal(() => m.collection("catches").update(created.id, { rev: 1, weight_hoz: 71 }));
    evidence("isTransactional() in each update hook", result);
    expect(result).not.toBe("allowed");
    expect((result as Refusal).message).toBe("TX onRecordUpdate=false onRecordUpdateExecute=false onRecordAfterUpdateSuccess=false.");
  });
});

describe("rule mechanic: @request.body.photo:length in a multipart create", () => {
  let spike: Spike;
  let s: Seed;
  beforeAll(async () => {
    spike = await startSpike({ hooks: [], mimes: ["image/jpeg"], thumbs: [] });
    s = await seed(spike.harness);
  });
  afterAll(() => spike.stop());

  const jpeg = async (n: number) => Promise.all(Array.from({ length: n }, (_, i) => fixture(i % 2 === 0 ? "clean-1.jpg" : "clean-2.jpg")));

  it("counts the uploaded files: 0 and 1 are refused by the rule, 2 and 4 pass", async () => {
    const m = await asUser(spike.harness, s.member);
    const out: Record<string, unknown> = {};
    for (const n of [0, 1, 2, 4]) out[`${n} files`] = await refusal(async () => m.collection("catches").create(catchForm(s, await jpeg(n))));
    evidence("photo:length with the rule `photo:length >= 2`", out);
    expect(out["0 files"]).not.toBe("allowed");
    expect(out["1 files"]).not.toBe("allowed");
    expect(out["2 files"]).toBe("allowed");
    expect(out["4 files"]).toBe("allowed");
  });

  it("is the rule that refuses 1 file: with the clause removed, 1 file is saved", async () => {
    const m = await asUser(spike.harness, s.member);
    await spike.harness.superuser.collections.update("catches", { createRule: '@request.auth.id != ""' });
    const one = await refusal(async () => m.collection("catches").create(catchForm(s, await jpeg(1))));
    await spike.harness.superuser.collections.update("catches", { createRule: '@request.auth.id != "" && @request.body.photo:length >= 2' });
    evidence("photo:length control: rule without the clause, 1 file", one);
    expect(one).toBe("allowed");
  });

  it("5 files pass the rule and are refused by the field's maxSelect", async () => {
    const m = await asUser(spike.harness, s.member);
    const result = await refusal(async () => m.collection("catches").create(catchForm(s, await jpeg(5))));
    evidence("5 files", result);
    expect(result).not.toBe("allowed");
  });

  it("counts text values too: two filenames sent as plain text pass the rule; the field refuses them", async () => {
    const m = await asUser(spike.harness, s.member);
    const before = await spike.storage();
    const form = catchForm(s, []);
    form.append("photo", "a.jpg");
    form.append("photo", "b.jpg");
    const result = await refusal(() => m.collection("catches").create(form));
    evidence("photo:length with two text filenames", result);
    expect(result).not.toBe("allowed");
    expect(await spike.storage()).toEqual(before);
  });
});

describe.each([
  ["none", "control: no check beyond the rule"],
  ["reread", "re-read in onRecordUpdate (what security.md says)"],
  ["cas", "atomic compare-and-swap UPDATE in onRecordUpdateExecute"],
  ["tx", "check and save inside runInTransaction, answering the request ourselves"],
])("rule mechanic: two photo adds at once with the same rev, %s", (mode, label) => {
  let spike: Spike;
  let s: Seed;
  beforeAll(async () => {
    spike = await startSpike({ hooks: ["rev_reread.pb.js"], mimes: [], thumbs: [], replace: { __REV_MODE__: mode } });
    s = await seed(spike.harness);
  });
  afterAll(() => spike.stop());

  it(`${label}`, async () => {
    const m = await asUser(spike.harness, s.member);
    const created = await m.collection("catches").create(catchForm(s, [await fixture("clean-1.jpg"), await fixture("clean-2.jpg")]));
    const results = await Promise.all([
      refusal(async () => m.collection("catches").update(created.id, await addPhoto(1, "clean-1.jpg", { delay_ms: "400" }))),
      refusal(async () => m.collection("catches").update(created.id, await addPhoto(1, "clean-2.jpg", { delay_ms: "400" }))),
    ]);
    const stored = await spike.harness.superuser.collection("catches").getOne(created.id);
    const files = (await spike.storage()).filter((f) => !f.path.endsWith(".attrs"));
    const allowed = results.filter((r) => r === "allowed").length;
    evidence(`rev race, mode=${mode}`, { results, allowed, photoOnRecord: stored.photo.length, rev: stored.rev, originalsOnDisk: files.length });
    if (mode === "none" || mode === "reread") {
      // Observed, not wished for: see the evidence file for what these actually did.
      expect(allowed).toBeGreaterThanOrEqual(1);
    } else {
      expect(allowed).toBe(1);
      expect(stored.photo).toHaveLength(3);
      expect(stored.rev).toBe(2);
      expect(files).toHaveLength(3);
    }
  });
});

describe("rule mechanic: judge.role against the submitted body in the events create rule", () => {
  let spike: Spike;
  let s: Seed;
  beforeAll(async () => {
    spike = await startSpike({ hooks: [], mimes: [], thumbs: [] });
    s = await seed(spike.harness);
  });
  afterAll(() => spike.stop());

  const body = (judge: string, extra: Record<string, unknown> = {}) => ({ name: "E", status: "draft", metric: "weight", best_n: 3, judge, ...extra });

  it("allows an organizer as judge, refuses a member as judge, and refuses a member creating", async () => {
    const organizer = await asUser(spike.harness, s.organizer);
    const member = await asUser(spike.harness, s.member);
    const other = (await spike.harness.superuser.collection("users").create(newUser({ name: "Second Org", role: "organizer", verified: true }))).id;
    const out: Record<string, unknown> = {
      "organizer creates, judge = an organizer": await refusal(() => organizer.collection("events").create(body(s.organizer.id))),
      "organizer creates, judge = a member": await refusal(() => organizer.collection("events").create(body(s.member.id))),
      "organizer creates, judge = nobody (unknown id)": await refusal(() => organizer.collection("events").create(body("nosuchuser00000"))),
      "organizer creates, judge = organizer, backup = same organizer": await refusal(() => organizer.collection("events").create(body(s.organizer.id, { backup_judge: s.organizer.id }))),
      "organizer creates, judge = organizer, backup = another organizer": await refusal(() => organizer.collection("events").create(body(s.organizer.id, { backup_judge: other }))),
      "member creates, judge = an organizer": await refusal(() => member.collection("events").create(body(s.organizer.id))),
    };
    evidence("events create rule: judge.role", out);
    expect(out["organizer creates, judge = an organizer"]).toBe("allowed");
    expect(out["organizer creates, judge = a member"]).not.toBe("allowed");
    expect(out["organizer creates, judge = nobody (unknown id)"]).not.toBe("allowed");
    expect(out["organizer creates, judge = organizer, backup = same organizer"]).not.toBe("allowed");
    expect(out["organizer creates, judge = organizer, backup = another organizer"]).toBe("allowed");
    expect(out["member creates, judge = an organizer"]).not.toBe("allowed");
  });
});
