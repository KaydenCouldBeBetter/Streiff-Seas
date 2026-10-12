# Fishing Scoreboard
Members-only leaderboard for a ~15-angler club's six-week tournaments. Anglers submit catches
with photos, the judge approves or rejects, standings update live. One developer; self-hosted.
<!-- Keep under 60 lines. Every line must prevent a real mistake. Kayden maintains this file; Claude never edits it. -->

## Stack and commands (decided — see docs/decisions.md)
- PocketBase pinned in POCKETBASE_VERSION; fetch with `scripts/fetch-pb.sh` (checks sha256).
- Node 24 LTS (package.json engines, .nvmrc).
- React + Vite + TypeScript in `web/`, built into `pb_public/`. pb_public is build output: gitignored, never edit it.
- Kayden runs these in his own terminals; don't start, stop or restart them, ask instead:
  local backend `./pocketbase serve --dev` (127.0.0.1:8090) and `npm run dev` (Vite proxies `/api` there).
- Tests: `npm test` (Vitest; boots a throwaway PocketBase from pb_migrations/ and pb_hooks/).
  One file: `npm test -- test/rules.test.ts`
- Build: `npm run build` (tsc + vite build into pb_public/).
- All checks: `npm run check` (tsc --noEmit, npm test, npm run build). The pre-push hook and CI run the same.
- New migration: `./pocketbase migrate create <snake_name>`
- Install: `npm ci --ignore-scripts`. Don't propose Vercel, Supabase, Cloudflare Pages, another backend or framework.

## Hard rules
- IMPORTANT: No production access. Never run ssh, scp, rsync, cloudflared, pct or deploy.sh; never read
  .env, ~/.ssh or ~/.cloudflared. Local seed data only.
- IMPORTANT: Never create tags or releases. A tag builds a release bundle; Kayden tags.
- IMPORTANT: API rules use `@request.body`, never `@request.data`. Rules run BEFORE hooks, so the rule itself
  must reject server-only fields (status, judged_by, reason, flags, rev). Hooks are only a backup.
- Never open or loosen a rule without its row in docs/security.md and its test in test/rules.test.ts, same commit.
- Nothing is deleted through the API: delete rules stay null. Retract and withdraw are flags; photos are append-only.
- Migrations are append-only: a new file for every change, never an edit to a committed one.
- Scoring lives only in web/src/lib/scoring.ts: pure, no deps, integers only (weight_hoz, length_q).
- Every catch, entry or event change writes exactly one audit_log row; every photo goes through the location strip.
- pb_hooks run in goja, not Node: CommonJS require() only, no async/await, no Node or browser APIs, no fetch.
- Runtime deps are react, react-dom and pocketbase only. Ask before adding any dependency, dev deps included.
- Don't change an existing test unless the matching docs/security.md row or docs/scoring.md example changes
  in the same commit; name that row or example in the commit message. Implementing a security.md row counts:
  change that row's expectation in test/schema.test.ts's RULES table and name the row ID.
- Files you can't edit (.github/workflows/, .githooks/, POCKETBASE_VERSION, .claude/): write a draft in docs/drafts/
  and tell Kayden to install it.

## Read on demand (paths, not imports)
- Scope, roles, invariants: `docs/SPEC.md`   Scoring rules and worked examples: `docs/scoring.md`
- Who may do what, with test IDs: `docs/security.md`
- Why things are the way they are: `docs/decisions.md` (it wins over every other doc)
- Screens, states and copy: `docs/screens.md`   Diagrams: `docs/architecture.md`
- Ops and the release pipeline (read-only for you): `docs/ops.md`

## Each session
- Start: read progress.md, then work on the first features.json item with "passes": false. One item per session.
  If that item has "human": true, it is Kayden's: stop and tell him; never skip ahead to a later item.
- Work on a branch `item/<features.json id>` created from main. Never push, switch to or merge into main;
  Kayden pushes, opens the pull request and merges after CI is green.
- Use plan mode for migrations, API rules, uploads and scoring.
- Done means `npm run check` output shown and the item's steps checked, not asserted.
  Only then set "passes": true.
- End: append 2–5 lines to progress.md and commit on the item branch.
- When compacting, keep: files changed, failing tests, the current features.json id.
