import { ClientResponseError, getTokenPayload } from "pocketbase";
import { describe, expect, it } from "vitest";
import { HEALTH_PATH, STUB_INDEX_MARKER, usePocketBase } from "./harness/pocketbase";
import { actAs, actAsAnon, createFixtureUsers, FIXTURE_NAMES, FIXTURE_USERS } from "./harness/users";

const pocketbase = usePocketBase();

describe("throwaway PocketBase", () => {
  it("answers the health endpoint with 200 and a JSON body", async () => {
    const response = await fetch(pocketbase().url + HEALTH_PATH);

    expect(response.status).toBe(200);
    // An unknown path also gets 200 (the index fallback), so the body is what proves health.
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(await response.json()).toMatchObject({ code: 200 });
  });

  it("serves index.html for a client route, so a refresh loads the app", async () => {
    const response = await fetch(pocketbase().url + "/tournaments/abc123/leaderboard");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(await response.text()).toContain(STUB_INDEX_MARKER);
  });

  it("starts from an empty database", async () => {
    const users = await pocketbase().superuser.collection("users").getFullList();

    expect(users).toEqual([]);
  });
});

describe("fixture users", () => {
  it("creates K, O, S, N, M, W, X and Y and acts as each through impersonation", async () => {
    const users = await createFixtureUsers(pocketbase());

    expect(Object.keys(users)).toEqual(["K", "O", "S", "N", "M", "W", "X", "Y"]);
    for (const key of FIXTURE_NAMES) {
      expect(users[key].name).toBe(FIXTURE_USERS[key].name);

      const client = await actAs(pocketbase(), users[key]);
      expect(client.authStore.isValid).toBe(true);
      expect(client.authStore.record?.id).toBe(users[key].id);

      // The server accepts the token as that user: the file token it issues names them.
      const fileToken = await client.files.getToken();
      expect(getTokenPayload(fileToken)).toMatchObject({ id: users[key].id, type: "file" });
    }
  });

  it("acts as anon with no auth", async () => {
    const client = actAsAnon(pocketbase());

    expect(client.authStore.isValid).toBe(false);
    const refused = await client.files.getToken().catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ClientResponseError);
    expect((refused as ClientResponseError).status).toBe(401);
  });
});
