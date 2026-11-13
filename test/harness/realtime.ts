// A realtime (SSE) client for the tests. Node has no EventSource, and the SDK's realtime
// service needs one, so this reads GET /api/realtime with fetch and posts the subscriptions
// itself, the way the SDK does: the first event, PB_CONNECT, carries the client id.

export interface RealtimeEvent {
  name: string;
  data: string;
}

export interface RealtimeClient {
  clientId: string;
  /** Sets this client's subscriptions; with a token, the server reads records as that user. */
  subscribe(topics: string[], token?: string): Promise<void>;
  /** Every event received so far, PB_CONNECT included. */
  events(): RealtimeEvent[];
  /** The first event of that name, received already or within timeoutMs. */
  next(name: string, timeoutMs: number): Promise<RealtimeEvent>;
  close(): void;
}

/** One SSE frame ("event:", "data:" lines) as PocketBase writes it. */
function parseFrame(frame: string): RealtimeEvent | null {
  let name = "message";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  return data.length > 0 || name !== "message" ? { name, data: data.join("\n") } : null;
}

export async function openRealtime(baseUrl: string, timeoutMs = 5_000): Promise<RealtimeClient> {
  const abort = new AbortController();
  const response = await fetch(`${baseUrl}/api/realtime`, { signal: abort.signal, headers: { Accept: "text/event-stream" } });
  if (!response.ok || response.body === null) throw new Error(`GET /api/realtime answered ${response.status}`);

  const received: RealtimeEvent[] = [];
  let waiters: Array<() => void> = [];
  const notify = () => {
    const current = waiters;
    waiters = [];
    for (const wake of current) wake();
  };

  // Reads the stream until it is closed or aborted.
  void (async () => {
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value.replace(/\r\n/g, "\n");
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const event = parseFrame(buffer.slice(0, end));
          buffer = buffer.slice(end + 2);
          if (event !== null) {
            received.push(event);
            notify();
          }
        }
      }
    } catch {
      // Aborted by close().
    }
  })();

  const next = (name: string, waitMs: number) =>
    new Promise<RealtimeEvent>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no "${name}" realtime event within ${waitMs} ms`)), waitMs);
      const check = () => {
        const found = received.find((event) => event.name === name);
        if (found) {
          clearTimeout(timer);
          resolve(found);
        } else {
          waiters.push(check);
        }
      };
      check();
    });

  const connect = await next("PB_CONNECT", timeoutMs).catch((error: unknown) => {
    abort.abort();
    throw error;
  });
  const clientId = (JSON.parse(connect.data) as { clientId: string }).clientId;

  return {
    clientId,
    async subscribe(topics, token) {
      const result = await fetch(`${baseUrl}/api/realtime`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
        body: JSON.stringify({ clientId, subscriptions: topics }),
      });
      if (result.status !== 204) throw new Error(`POST /api/realtime answered ${result.status}: ${await result.text()}`);
    },
    events: () => [...received],
    next,
    close: () => abort.abort(),
  };
}
