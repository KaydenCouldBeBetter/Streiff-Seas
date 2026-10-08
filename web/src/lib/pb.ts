import PocketBase from "pocketbase";
import { noteServerDate } from "./serverClock";

/** A PocketBase SDK client whose every response feeds the server-clock offset. */
export function createClient(baseUrl: string): PocketBase {
  const client = new PocketBase(baseUrl);
  client.beforeSend = (url, options) => {
    const send = options.fetch ?? fetch;
    // Timed around fetch itself, which resolves when the headers arrive. The SDK's afterSend
    // runs only after the body is read, and a slow download would count as clock offset.
    options.fetch = async (input, init) => {
      const sentAtMs = Date.now();
      const response = await send(input, init);
      noteServerDate(response.headers.get("Date"), Date.now(), sentAtMs);
      return response;
    };
    return { url, options };
  };
  return client;
}

/** The one shared client. The app is served from PocketBase's own origin, so the base is "/". */
export const pb = createClient("/");
