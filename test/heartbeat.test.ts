// pb_hooks/heartbeat.pb.js (features.json M0-03 step 1): a "heartbeat" realtime message once a
// minute, only to clients subscribed to it. The job is run at once through the superuser's
// crons API (POST /api/crons/heartbeat), so the test doesn't wait for the minute tick and the
// shipped hooks need no route of their own.

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { usePocketBase } from "./harness/pocketbase";
import { openRealtime, type RealtimeClient } from "./harness/realtime";
import { actAs, createFixtureUsers, type FixtureUsers } from "./harness/users";

const pocketbase = usePocketBase();

let users: FixtureUsers;
const open: RealtimeClient[] = [];

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
});

afterEach(() => {
  for (const client of open.splice(0)) client.close();
});

async function realtime(): Promise<RealtimeClient> {
  const client = await openRealtime(pocketbase().url);
  open.push(client);
  return client;
}

describe("heartbeat", () => {
  it("is a cron job that runs every minute", async () => {
    const jobs = await pocketbase().superuser.crons.getFullList();

    expect(jobs).toContainEqual({ id: "heartbeat", expression: "* * * * *" });
  });

  it("reaches a client subscribed to it, and not one subscribed only to catches", async () => {
    const listening = await realtime();
    await listening.subscribe(["heartbeat"]);
    const other = await realtime();
    const m = await actAs(pocketbase(), users.M);
    await other.subscribe(["catches/*"], m.authStore.token);

    await pocketbase().superuser.crons.run("heartbeat");

    const beat = await listening.next("heartbeat", 3_000);
    expect(JSON.parse(beat.data)).toEqual({});
    // The message went out to every client in the same pass; give the other one a moment anyway.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(other.events().map((event) => event.name)).toEqual(["PB_CONNECT"]);
  });

  it("reaches every client subscribed to it", async () => {
    const first = await realtime();
    const second = await realtime();
    await first.subscribe(["heartbeat", "catches/*"]);
    await second.subscribe(["heartbeat"]);

    await pocketbase().superuser.crons.run("heartbeat");

    await expect(first.next("heartbeat", 3_000)).resolves.toMatchObject({ name: "heartbeat" });
    await expect(second.next("heartbeat", 3_000)).resolves.toMatchObject({ name: "heartbeat" });
  });
});
