// Build-time only (imported by vite.config.ts, never by the app): the contents of
// pb_public/build.json, which the deploy smoke tests read to see which commit is running.

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
