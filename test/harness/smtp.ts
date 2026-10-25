// A fake SMTP server on 127.0.0.1, so a test can read the mail PocketBase sends (the OTP
// code) without a real provider. Plain SMTP only: no TLS, and any AUTH is accepted.

import { createServer, type AddressInfo, type Socket } from "node:net";

export interface Mail {
  from: string;
  to: string[];
  /** The whole DATA section: headers and body, as sent. */
  raw: string;
}

export interface FakeSmtp {
  host: string;
  port: number;
  /** Every message received so far, oldest first. */
  mails: Mail[];
  stop(): Promise<void>;
}

/** The address in "MAIL FROM:<a@b>" or "RCPT TO:<a@b> SIZE=1". */
function address(line: string): string {
  return /<([^>]*)>/.exec(line)?.[1] ?? "";
}

function serve(socket: Socket, mails: Mail[]): void {
  let from = "";
  let to: string[] = [];
  let data: string[] | undefined;
  let buffered = "";
  const reply = (line: string) => socket.write(`${line}\r\n`);

  reply("220 fake-smtp ready");
  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffered += chunk;
    let end: number;
    while ((end = buffered.indexOf("\r\n")) !== -1) {
      const line = buffered.slice(0, end);
      buffered = buffered.slice(end + 2);

      if (data !== undefined) {
        if (line === ".") {
          mails.push({ from, to, raw: data.join("\r\n") });
          data = undefined;
          from = "";
          to = [];
          reply("250 queued");
        } else {
          // Dot-stuffing: a line that began with "." was sent with a second one.
          data.push(line.startsWith("..") ? line.slice(1) : line);
        }
        continue;
      }

      const verb = line.slice(0, 4).toUpperCase();
      if (verb === "EHLO") {
        reply("250-fake-smtp");
        reply("250 AUTH PLAIN LOGIN");
      } else if (verb === "HELO") reply("250 fake-smtp");
      else if (verb === "AUTH") reply("235 accepted");
      else if (verb === "MAIL") {
        from = address(line);
        reply("250 ok");
      } else if (verb === "RCPT") {
        to.push(address(line));
        reply("250 ok");
      } else if (verb === "DATA") {
        data = [];
        reply("354 go ahead");
      } else if (verb === "QUIT") {
        reply("221 bye");
        socket.end();
      } else reply("250 ok");
    }
  });
  socket.on("error", () => socket.destroy());
}

export async function startFakeSmtp(): Promise<FakeSmtp> {
  const mails: Mail[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    serve(socket, mails);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    host: "127.0.0.1",
    port,
    mails,
    stop: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

/** The message body with quoted-printable soft breaks and escapes undone, for searching. */
export function decodedText(mail: Mail): string {
  const body = mail.raw.slice(mail.raw.indexOf("\r\n\r\n") + 4);
  const quotedPrintable = body
    .replace(/=\r\n/g, "")
    .replace(/=([0-9A-F]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  // A base64 part, if the mailer chose that: decode every long base64-looking line too.
  const base64 = body
    .split("\r\n")
    .filter((line) => /^[A-Za-z0-9+/]{16,}={0,2}$/.test(line))
    .map((line) => Buffer.from(line, "base64").toString("utf8"))
    .join("\n");
  return `${quotedPrintable}\n${base64}`;
}
