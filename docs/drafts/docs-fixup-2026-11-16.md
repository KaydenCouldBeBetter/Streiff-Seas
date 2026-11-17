# Draft: docs fix-up pass, 16 Nov 2026

For Kayden to apply. Claude edited no tracked file for this pass (drafts only, your call): the S1 session has
uncommitted edits to `SPEC.md`, `decisions.md` and `security.md`, and `ops.md`, `CLAUDE.md` and `.claude/` are not Claude's to edit.
Every patch below anchors on the text to find, not on a line number, because S1 is still moving lines.
**Facts only:** nothing here settles an open decision (those are in section 4).

Checked against: `progress.md` (all entries), `features.json`, every migration and hook in `pb_migrations/` and `pb_hooks/`,
`web/src/` (screens, `lib/`), the `test/` file list, and the uncommitted S1 diff (`no_deletes.pb.js`, R-ALL-D-02).
Sampled, not read line by line: `screens.md` §2 state rows and `scoring.md` against the built screens (no drift found in what I read).

## 0. How to apply

1. **Wait for S1's current docs edits to be committed**, then apply sections 1 to 3. Each is independent; none touches a line S1 has changed
   (SPEC's role table, decisions' 2026-11-16 row and Open item 15, security's v0.15 status and R-ALL-D-02).
2. Do section 1 first: those are finished drafts that already exist and several patches below depend on them.
3. Suggested commits (by path, since they'll sit beside S1 work): `docs: install the M0-01 and M0-04 drafts`, `docs: bring README, CLAUDE.md, SPEC, architecture, security and ops in line with the code`.
4. Move or delete `docs/drafts/decisions-L2-photo-spike.md`, `ops-md-m0-01.md` and this file once installed (they are drafts, not records).

## 1. Drafts that were never installed (still in `docs/drafts/`)

| Draft | Goes to | Why it matters now |
|---|---|---|
| `decisions-L2-photo-spike.md` §1 (the 2026-11-13 row) | `decisions.md` log, as the row after 2026-11-13 M0-03 | The log still has no photo-spike result. L2 still says "pending the Phase 2 photo spike" while S1 has already built Option A. Item closed 2026-11-13 per `progress.md`. |
| `decisions-L2-photo-spike.md` §5 | `security.md` Open items 2 and 7 (strike), hooks paragraphs (see 3.3 below) | Open items 2 and 7 are answered and built. |
| `ops-md-m0-01.md` | `ops.md` §5, under step 7 | `deploy.sh`'s smoke test needs the health path and the build ID; both are recorded only in the draft. |

After installing the first two: strike `decisions.md` Open items **1** (photo spike) and **2** (health endpoint, index fallback), each with the date and the row that settled it.

## 2. Files Claude can't edit: `CLAUDE.md`, `ops.md`

### 2.1 CLAUDE.md

1. In "Stack and commands", replace
   `- All checks: \`npm run check\` (tsc --noEmit, npm test, npm run build). The pre-push hook and CI run the same.`
   with
   `- All checks: \`npm run check\` (tsc --noEmit, npm test, npm run build). Run it by hand: the pre-push hook and CI are not built yet (M0-05a/b skipped, decisions.md Open items and progress.md 2026-11-14), so nothing else runs it.`
2. In "Stack and commands", add after the Tests line:
   `- exiftool must be installed wherever PocketBase runs, tests included: pb_hooks/catch_lib.js strips every upload with it and fails closed if it is missing.`
3. In "Hard rules", replace
   `- Nothing is deleted through the API: delete rules stay null. Retract and withdraw are flags; photos are append-only.`
   with
   `- Nothing is deleted, by anyone: delete rules stay null, and pb_hooks/no_deletes.pb.js refuses every delete in the six collections, the superuser's included (R-ALL-D-02). A test that needs a spare record renames one and puts it back. Retract and withdraw are flags; photos are append-only.`
4. In "Hard rules", append to the pb_hooks line:
   `Shared code goes in a module loaded with require(\`${__hooks}/name.js\`) (pb_hooks/catch_lib.js): a function declared at the top level of a *.pb.js file isn't visible inside its handlers. No update hook runs in a transaction, so an audit row for an update is saved right after the record, and the catch rev check is a compare-and-swap UPDATE in onRecordUpdateExecute.`
5. Optional: `.nvmrc` says 24, and this dev shell has Node 20.20. Add "run `nvm use` first" to the Node line if that has bitten anyone.

### 2.2 ops.md

1. **§5, step 1 and 2 of "From change to prod", and §15:** the `pre-push` hook and `ci.yml` don't exist yet. Add after the numbered list:
   > **Status 16 Nov 2026:** steps 2 to 5 (CI, bundle artifact, staging timer) are not built: M0-05a/b were skipped for the deadline (Kayden, 14 Nov). Until they are, `npm run check` by hand on the dev VM is the only gate, and nothing deploys to staging. Add a §15 row "CI, `ci.yml`, bundle artifact: TODO (M0-05a)" and "`deploy.sh` and the staging timer: TODO (M0-05b)".
2. **§5, new paragraph under "`deploy.sh <tag>` on prod":**
   > **exiftool.** The catch hooks run `exiftool -all=` on every uploaded photo (`pb_hooks/catch_lib.js`) and refuse the photo if exiftool is missing. Install `libimage-exiftool-perl` in the prod and staging containers (13.25 ran in the spike; anything from 12.24 on has the CVE-2021-22204 fix) and let `unattended-upgrades` keep it patched (§6). Under `ProtectSystem=strict` the unit needs `pb_data` writable: the hook keeps its temp files there, not in `/tmp`. Add `exiftool -ver` to the smoke test. Dev machines and CI need it too, or `npm test` fails.
3. **§12 "Other superuser actions":** add a row
   | A record really must be deleted (a legal erasure request) | Don't: `pb_hooks/no_deletes.pb.js` refuses every delete, the admin UI's included (`decisions.md` 2026-11-16). It takes a deploy that changes the hook; log it here and in §13, and write down what replaces the member's name in `audit_log` | Delete in the admin UI, or edit `pb_data` directly |
4. **§14 table:** the sign-up row (`users` create) is more exposed now that anyone can create an account (`decisions.md` 2026-10-25). Change its first cell to "Rate limit: sign-up (`users` create), **open to the public**" and keep the TODO. Nothing else changes.
5. **§9 "Any time: adding or removing a member":** fine as written. After a sign-up the member is `role = member`, unverified until they enter the emailed code (R-USR-A-03).

## 3. Files Claude could edit but S1 is touching or the pass is better applied once

### 3.1 README.md (replace the whole file; it is the only doc a new reader opens first)

```markdown
# Chromie Fishing

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
```

### 3.2 SPEC.md (three small edits, none in the role table)

1. **Status line:** append `v0.4, 16 Nov 2026: Q6 closed by the photo spike (2026-11-13), open self sign-up recorded in Must do 1 (2026-10-25), and "nothing is deleted" now covers the superuser (2026-11-16, invariant 6).`
2. **Must do, item 1:** `sign-in (Access + PocketBase OTP)` → `sign-in or self sign-up (Access + PocketBase OTP, an 8-digit emailed code)`.
3. **Open question 6** → `~~**Capture time:** …~~ **Closed 2026-11-13 (photo spike, M0-04):** the browser reads \`DateTimeOriginal\` from the original file before re-encoding. On iPhone Safari a library photo keeps it; a photo taken live through the picker has none, so the catch gets \`no_capture_time\`. Android Chrome is untested (no phone), and the `decisions.md` row says so.`

### 3.3 security.md

1. **R-ENT-L-05** (`| R-ENT-L-05 | K | List entries | All, including withdrawn | rule |`): change the expectation to `All entries outside a draft event, including withdrawn (the rule's first clause, \`event.status != "draft"\`, holds for K too; decisions.md 2026-11-13)`. This is the rewording v0.13 and the 2026-11-13 row both left for you. The test already reads it that way.
2. **Open items 2 and 7:** strike through with `Settled 2026-11-13 (M0-04, decisions.md photo-spike row)`. Item 7's `rev` clause becomes: the angler update hook can't re-read `rev` inside a transaction (no record update hook runs in one); R-CAT-U-40 is met by a compare-and-swap `UPDATE catches SET rev = rev + 1 WHERE id = … AND rev = …` in `onRecordUpdateExecute` (`pb_hooks/catches_update.pb.js`).
3. **Hooks, "On update by the angler" and "On update by a judge":** replace "re-read the stored `rev` inside the save transaction and refuse if it no longer matches the request" with "compare-and-swap the stored `rev` in `onRecordUpdateExecute` (one atomic UPDATE; refuse if no row changed)". Same words in "Why `rev`" (line beginning `**Why \`rev\`:**`) if it says "transaction". And in "On create": "strip or refuse location data" → "strip every upload with exiftool, then refuse if anything location-capable is still in the cleaned bytes (fail closed)".
4. **Table of ongoing procedures, "Adding a member"** (`| Adding a member | Add to the Access list **and** have the superuser create the PocketBase user |`): since open sign-up the member creates their own record: `Add to the Access list; the member then creates their own account (open sign-up, R-USR-C-01), or the superuser creates it`. The check ("Both lists must match") stays.

### 3.4 architecture.md

1. **Status line:** `Draft v0.7, 16 Nov 2026. §3 brought in line with the migrations (users create and read, nothing deleted), §4 with the rev compare-and-swap, "What the Phase 2 work must confirm" with the spike result; CI, the pre-push hook and the staging pipeline are marked not built.`
2. **§3 table, `users` row** (`| \`users\` | Own record; organizer sees all (R-USR-L, V) | \`null\`: invite via admin UI, name always set (R-USR-C) | … |`): create cell → `Anyone not signed in, as \`role = member\` only; no \`verified\`, \`emailVisibility\` or organizer role; name always set (R-USR-C-01, C-04 to C-09; decisions.md 2026-10-25)`; update cell → add `or \`emailVisibility\` (R-USR-U-08)`.
3. **§3, after "Cells with no dedicated row are covered by the `R-ALL-*` sweeps":** add `Every Delete cell is \`null\`, and \`pb_hooks/no_deletes.pb.js\` also refuses every delete from the superuser and the admin UI (R-ALL-D-02; decisions.md 2026-11-16).`
4. **§4 sequence diagram:** `Hook - rev re-read in the transaction, existing photos and capture times kept, strip added photo, flag it, rev plus 1` → `Hook - existing photos and capture times kept, exiftool strip of the added photo, flag it; rev compare-and-swap in onRecordUpdateExecute (rev plus 1)`.
5. **"Why photos are append-only":** the sentence "The photo spike must confirm that ordering on the pinned version; if it …" → "Confirmed on v0.40.4 by the photo spike (decisions.md 2026-11-13)." Drop the closing line of the final section ("If the append-only check can't run before …") for the same reason.
6. **"What the Phase 2 work must confirm"** → retitle "Phase 2 results" with:
   - Photo spike: done 2026-11-13 (Option A, exiftool; iPhone Safari run; **Android Chrome untested**).
   - On the pinned binary: `judge.role` resolves against the body, `photo:length` counts uploads, and `rev` is a compare-and-swap rather than a transaction read (all confirmed).
   - Soak test (X-ACC-05): **not done** (M0-07, waived for the deadline).
7. **§5 and the diagram at `CI[…]` and `DEV[…]`:** add a one-line note under the §5 heading: `Not built as of 16 Nov 2026: ci.yml, the pre-push hook, the bundle artifact, deploy.sh and the staging container (M0-05a/b, M0-06; skipped for the deadline). The diagram is the target.` Also add exiftool to the prod and staging LXC boxes.

### 3.5 decisions.md

1. Install the photo-spike row and strike Open items 1 and 2 (section 1).
2. **L2 heading** `### L2. Photo pipeline (2026-10-01, pending the Phase 2 photo spike)`: the log is append-only, so don't rewrite it; add one line under the heading: `**Result, 2026-11-13:** Option A, exiftool \`-all=\` then a scan of the cleaned bytes; see the 2026-11-13 photo-spike row. Option B as written is dropped.`
3. **L1** (`Users are created only by the superuser (\`users\` create rule \`null\`)` and "having the superuser create their PocketBase user"): add one line under the L1 heading: `**Superseded in part, 2026-10-25:** members now create their own account (open self sign-up); the \`users\` create rule is open for anon as \`role = member\` only. Everything else in L1 stands.`
4. **A row recording the waiver already stated in `progress.md` (2026-11-14, "Kayden's call")**, for you to confirm or reword:
   | 2026-11-14 | **S1 starts before M0-05a/b, M0-06 to M0-09 are done** (deadline). `ci.yml`, the pre-push hook, `deploy.sh`, staging, the 15-minute soak and the M0 exit gate are skipped for now. `npm run check` by hand is the only gate; every migration and rule diff is read by Kayden before merge. **Replaces** the 2026-10-07 backlog order ("M0-09 gate before any S1 work") for the time being. | The first tournament is summer 2027 and the deadline is nearer than the pipeline | The M0 gate: do it before the tournament window, not after |

## 4. Needs a decision from Kayden (not settled here)

| What | Why it's now |
|---|---|
| **Open item 18**, name sync and the audit log | Due "before S1 adds the entries hooks"; they exist (`entries_join.pb.js`, `entries_withdraw.pb.js`), and CLAUDE.md still says every entry change writes exactly one audit row. A rename writes none. |
| **Open item 16**, authAlert | Due "step 5, with SMTP"; S1a already sends real mail. Its new-device email still tells members to change a password they don't have. |
| **Open items 17 and 20** and the word "proposed" | `item/DARK-01-dark-mode` is merged, so item 20's "before … merges" has passed with the rows still marked proposed (`decisions.md` 2026-11-12 rows, `screens.md` PRF-01c to 01g). Item 17 is tied to `item/PRF-01-profile`, whose code is in the log (`bd7e8bc`) but whose `passes` is still false. Accept or change, then I'll drop the word in a follow-up. |
| **`features.json` status** | `M0-03-live-skeleton` is built and tested (`progress.md` 2026-11-13) but `passes` is false pending your manual checks; `PRF-01-profile` the same; M0-05a/b are skipped. CLAUDE.md's "first item with `passes: false`" therefore points at M0-03, not S1. Say whether to set M0-03 true, and whether to mark M0-05a/b "deferred" so a fresh session doesn't start there. |
| **Item 12 / 13 / 14 / 11** (prod's sshd, egress, network, hand-installed PocketBase) | Unchanged and still due at M0-06; listed so the pass doesn't look like it dropped them. |
| **S1 loose end** | `test/zz-scratch-sweeps.test.ts` is untracked beside `test/sweeps.test.ts`: it looks like a scratch copy the S1 session should delete before its commit. |

## 5. Progress line to append to `progress.md` when you apply this (S1 appends there too, so I haven't)

```
- 2026-11-16 · docs fix-up (drafts only; not a features.json item, Kayden's call) · docs/drafts/docs-fixup-2026-11-16.md lists every doc statement that no longer matched the code, with the replacement text: README, CLAUDE.md, ops.md (exiftool, CI and hook not built, delete hook), SPEC, architecture (users rules, rev compare-and-swap, spike result), security (R-ENT-L-05, open items 2 and 7), decisions (L1 and L2 notes, the 14 Nov waiver) and the three uninstalled drafts. No tracked file was edited. Open decisions: Open items 16 to 18 and 20, and M0-03's `passes`.
```
