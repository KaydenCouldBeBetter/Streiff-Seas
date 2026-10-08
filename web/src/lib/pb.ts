import PocketBase from "pocketbase";
import { noteServerDate } from "./serverClock";

/** A PocketBase SDK client whose every response feeds the server-clock offset. */
export function createClient(baseUrl: string): PocketBase {
  const client = new PocketBase(baseUrl);
  client.afterSend = (response, data) => {
    noteServerDate(response.headers.get("Date"));
    return data;
  };
  return client;
}

/** The one shared client. The app is served from PocketBase's own origin, so the base is "/". */
export const pb = createClient("/");
