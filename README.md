# Streiff Seas

Members-only live leaderboard for the club's six-week fishing tournaments: anglers submit catches with two proof photos, the judge approves or rejects them, and standings update live on phones.

- Backend: PocketBase (version pinned in `POCKETBASE_VERSION`), self-hosted behind Cloudflare Tunnel and Access.
- Frontend: React + Vite + TypeScript in `web/`, built into `pb_public/` (build output: gitignored, never edited) and served on the same origin.
- Photos: every upload is stripped with exiftool in `pb_hooks/` before it is stored, so exiftool must be installed wherever PocketBase runs, tests included.
- Node 24 LTS (`.nvmrc`, `package.json` engines).

## Run locally

1. `npm ci --ignore-scripts`
2. `scripts/fetch-pb.sh` (checks the sha256 of the pinned PocketBase)
3. Install exiftool (`brew install exiftool`, or `apt install libimage-exiftool-perl`)
4. `./pocketbase serve --dev` (127.0.0.1:8090), then `npm run dev` (Vite proxies `/api` there)

## Checks

- `npm test` runs Vitest; each test file boots a throwaway PocketBase from `pb_migrations/` and `pb_hooks/`. One file: `npm test -- test/rules.test.ts`.
- `npm run check` is tsc, the tests and the build. It is run by hand: there is no CI or pre-push hook yet (M0-05a/b).

## Where things are

`docs/SPEC.md` (scope and invariants), `docs/scoring.md` (rules and worked examples), `docs/security.md` (who may do what, with test IDs), `docs/decisions.md` (why; it wins over every other doc, and ends with the open items), `docs/screens.md`, `docs/architecture.md`, `docs/ops.md`. Backlog: `features.json`. What happened last: `progress.md`. Agent instructions: `CLAUDE.md`.
