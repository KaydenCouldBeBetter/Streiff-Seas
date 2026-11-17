// A stand-in for curl on the PATH of scripts under test (test/harness/deployKit.ts). It never
// touches the network: every URL is answered from routes.json in $SHIM_DIR, except the smoke
// URL ($SHIM_SMOKE_URL), which answers for whichever release the systemctl shim last started
// (its health is 503 when $SHIM_DIR/unhealthy-<that release's BUILD_INFO sha> exists).
// Every call is appended to calls.log, argv and headers apart, so a test can check that no
// secret was ever passed on a command line.
import { appendFileSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = process.env.SHIM_DIR;
const argv = process.argv.slice(2);

const VALUE_FLAGS = new Set(["-o", "--output", "-H", "--header", "-w", "--write-out", "--proto", "--proto-redir", "--retry", "--max-time", "-X"]);
let output;
let writeOut;
let fail = false;
let url;
const headers = [];
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (VALUE_FLAGS.has(arg)) {
    const value = argv[++i];
    if (arg === "-o" || arg === "--output") output = value;
    else if (arg === "-w" || arg === "--write-out") writeOut = value;
    else if (arg === "-H" || arg === "--header") {
      const text = value.startsWith("@") ? readFileSync(value.slice(1), "utf8") : value;
      for (const line of text.split("\n")) if (line.trim() !== "") headers.push(line.trim());
    }
  } else if (/^-[a-zA-Z]+$/.test(arg)) {
    if (arg.includes("f")) fail = true;
  } else if (arg.startsWith("--")) {
    if (arg === "--fail") fail = true;
  } else {
    url = arg;
  }
}

appendFileSync(path.join(dir, "calls.log"), JSON.stringify({ tool: "curl", argv, url, headers }) + "\n");

function header(name) {
  const line = headers.find((h) => h.toLowerCase().startsWith(name.toLowerCase() + ":"));
  return line?.slice(name.length + 1).trim();
}

/** @returns {{ status: number, body?: string, file?: string } | "refused"} */
function answer() {
  const smokeBase = process.env.SHIM_SMOKE_URL;
  if (smokeBase !== undefined && url.startsWith(smokeBase + "/")) {
    if (header("CF-Access-Client-Id") === undefined || header("CF-Access-Client-Secret") === undefined) {
      return { status: 302, body: "Access login" };
    }
    const state = JSON.parse(readFileSync(path.join(dir, "state.json"), "utf8"));
    if (!state.running) return "refused";
    const route = url.slice(smokeBase.length);
    if (route === "/api/health") {
      const sha = readFileSync(path.join(state.release, "BUILD_INFO"), "utf8").trim();
      return existsSync(path.join(dir, `unhealthy-${sha}`))
        ? { status: 503, body: '{"message":"down","code":503,"data":{}}' }
        : { status: 200, body: '{"message":"API is healthy.","code":200,"data":{}}' };
    }
    if (route === "/build.json") return { status: 200, file: path.join(state.release, "pb_public", "build.json") };
    return { status: 404, body: "Not Found" };
  }
  const routes = JSON.parse(readFileSync(path.join(dir, "routes.json"), "utf8"));
  const route = routes[url];
  if (route === undefined) return { status: 404, body: '{"message":"Not Found"}' };
  if (route.json !== undefined) return { status: route.status ?? 200, body: JSON.stringify(route.json) };
  return { status: route.status ?? 200, body: route.body, file: route.file };
}

const result = answer();
if (result === "refused") {
  process.stderr.write(`curl: (7) Failed to connect to ${url}\n`);
  process.exit(7);
}
if (fail && result.status >= 400) {
  process.stderr.write(`curl: (22) The requested URL returned error: ${result.status}\n`);
  process.exit(22);
}
if (output !== undefined && output !== "/dev/null") {
  if (result.file !== undefined) copyFileSync(result.file, output);
  else writeFileSync(output, result.body ?? "");
} else if (output === undefined) {
  process.stdout.write(result.file !== undefined ? readFileSync(result.file) : (result.body ?? ""));
}
if (writeOut === "%{http_code}") process.stdout.write(String(result.status));
