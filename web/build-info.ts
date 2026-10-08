// Build-time only (imported by vite.config.ts and vitest.config.ts, never by the app): the
// contents of pb_public/build.json, which the deploy smoke tests read to see which commit is
// running, and the compile-time constants the app is built with.

export interface BuildInfo {
  sha: string;
  built_at: string;
}

const FULL_SHA = /^[0-9a-f]{40}$/;

/** CI sets GITHUB_SHA to the commit being built; anywhere else the sha is "dev". */
export function buildInfo(env: Record<string, string | undefined>, now: Date): BuildInfo {
  const sha = env.GITHUB_SHA;
  return {
    sha: sha !== undefined && FULL_SHA.test(sha) ? sha : "dev",
    built_at: now.toISOString(),
  };
}

/** Vite's `define` for the app (declared in web/src/vite-env.d.ts); the build and the tests share it. */
export function buildDefine(info: BuildInfo): Record<string, string> {
  return {
    __BUILD_SHA__: JSON.stringify(info.sha),
  };
}
