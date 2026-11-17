// A stand-in for systemctl (test/harness/deployKit.ts): `start` "runs" whatever release
// $SHIM_OPT/current points to, so the curl shim's smoke URL answers for it; the start fails when
// $SHIM_DIR/start-fails-<that release's BUILD_INFO sha> exists. State lives in $SHIM_DIR/state.json.
import { appendFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = process.env.SHIM_DIR;
const argv = process.argv.slice(2);
appendFileSync(path.join(dir, "calls.log"), JSON.stringify({ tool: "systemctl", argv }) + "\n");

const stateFile = path.join(dir, "state.json");
const state = JSON.parse(readFileSync(stateFile, "utf8"));
const [action] = argv;

if (action === "stop") {
  state.running = false;
} else if (action === "start") {
  const release = realpathSync(path.join(process.env.SHIM_OPT, "current"));
  const sha = readFileSync(path.join(release, "BUILD_INFO"), "utf8").trim();
  if (existsSync(path.join(dir, `start-fails-${sha}`))) {
    state.running = false;
    writeFileSync(stateFile, JSON.stringify(state));
    process.stderr.write("Job for scoreboard.service failed.\n");
    process.exit(1);
  }
  state.running = true;
  state.release = release;
  state.starts = (state.starts ?? 0) + 1;
}
writeFileSync(stateFile, JSON.stringify(state));
