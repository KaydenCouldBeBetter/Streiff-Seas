# Chromie Fishing

Members-only live leaderboard for the club's six-week fishing tournaments: anglers submit catches with two proof photos, the judge approves or rejects them, and standings update live on phones.

- Backend: PocketBase (version pinned in `POCKETBASE_VERSION`), self-hosted behind Cloudflare Tunnel and Access.
- Frontend: React + Vite + TypeScript in `web/`, built into `pb_public/` and served on the same origin.
- Node 24 LTS for development and CI.

Run locally: `scripts/fetch-pb.sh`, then `./pocketbase serve --dev` and `npm run dev`. Tests: `npm test`.
Docs: `docs/SPEC.md` (scope), `docs/scoring.md` (rules), `docs/security.md` (who may do what), `docs/decisions.md` (why). Backlog: `features.json`.
