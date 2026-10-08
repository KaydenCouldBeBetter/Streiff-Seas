import { execFile } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "./harness/pocketbase";

const TSC = path.join(REPO_ROOT, "node_modules", ".bin", "tsc");
const FIXTURE = path.join(REPO_ROOT, "test", "fixtures", "node-in-web");

interface Result {
  code: number | string | null;
  output: string;
}

function typeCheck(project: string): Promise<Result> {
  return new Promise((resolve) => {
    execFile(TSC, ["--noEmit", "--pretty", "false", "-p", project], (error, stdout, stderr) => {
      resolve({ code: error === null ? 0 : (error.code ?? null), output: stdout + stderr });
    });
  });
}

describe("the browser project (web/tsconfig.json)", () => {
  it("refuses Node globals, so one can't reach the bundle through the type check", async () => {
    const result = await typeCheck(FIXTURE);

    expect(result.code).not.toBe(0);
    expect(result.output).toContain("Cannot find name 'process'");
    expect(result.output).toContain("Cannot find name 'Buffer'");
  });
});
