# SPEC: Fishing Scoreboard

**Status:** Draft v0.3, 7 Oct 2026: Q7 closed, Q6 tracked in `decisions.md` Open items (one list for the whole project), risk R9 added for the release pipeline, and paths updated now that the repo is the source of truth (`decisions.md` 2026-10-07). v0.2, 1 Oct 2026; `scoring.md` v0.4 agreed by the group the same day, and v0.5 on 3 Oct 2026 (Must do 1 updated for the two required photos); v0.6 in force from 5 Oct 2026 without a group vote (`decisions.md` 2026-10-05). Q1–Q4 closed by `decisions.md` entries of 2026-10-01; slices and roles updated to match. Q8 closed 6 Oct 2026 (`ops.md` v0.6). Sources of truth: `scoring.md` (rules), `decisions.md` (choices), `security.md` (who may do what). Where this page and `dev-lifecycle-guide.md` disagree, this page wins; `decisions.md` wins over both.

## Goal
A members-only web app where ~10–15 club anglers submit catches (bass for tournament 1) with proof photos during a ~6-week tournament window, the judge approves or rejects them, and everyone sees a correct, live leaderboard. First tournament: summer 2027.

## Roles × capabilities
Roles are a `users.role` (`member` or `organizer`) plus two per-tournament fields: `events.judge` and `events.backup_judge`. Test IDs for each row are in `security.md`.

| Capability | Anonymous | Member | Judge (this tournament) | Backup judge (this tournament) | Superuser |
|---|---|---|---|---|---|
| See leaderboard | No | Yes | Yes | Yes | Admin UI only |
| Join a tournament (own entry, while live, before the final deadline) | No | Yes | Yes | Yes | Not used |
| Withdraw from a tournament | No | Own entry, until final; rejoin only if they withdrew themselves and joining is open | Own entry; anyone's via the organizer role, with a reason for someone else; reinstate anyone | Own entry only | Break-glass only |
| Submit a catch to own entry, in window; edit, add photos to or retract it while pending | No | Yes | Yes | Yes | Not used |
| Approve / reject / correct / re-judge a catch | No | No | Anyone's except own | **Only the judge's** | Break-glass only |
| Create, open, close, finalize a tournament | No | No | Organizer role only | No | Break-glass only |
| Add a species (for future tournaments) | No | No | Organizer role only | No | Rename: break-glass only (never removed, `decisions.md` 2026-11-16) |
| Change own name and display units | No | Yes | Yes | Yes | — |
| Change any role | No | No | No | No | Admin UI, logged in `ops.md` |
| Delete anything | No | No | No | No | No: a hook refuses it (`decisions.md` 2026-11-16) |

## Must do (MVP: four slices)
1. **Submit:** sign-in (Access + PocketBase OTP); Join on the tournament page; one fish per submission with the two required photos (holding the fish; on the scale or board) and up to 2 more, species chosen from the tournament's list only; weight or length per the tournament's metric; capture time read, then all metadata stripped; unique `client_uuid`; Sending / Received / NOT SENT + Retry. While the catch is pending, the angler can **edit** species and measurement (until judged or the final deadline), **add photos** up to 4 in total (append-only: never removed or replaced; flagged for the judge), or **retract** it (hidden from others, never scores, kept on record). Withdraw and rejoin.
2. **Score:** pure `web/src/lib/scoring.ts`, best 10 verified, culls, tie-break by fish position, shared places; withdrawn entries, rejected and retracted catches left out; leaderboard with total, counted fish, biggest fish, pending count; per-member display units.
3. **Judge:** queue with flags (no capture time, outside window, >24 h before submission, photo added after submission, an extra photo with no capture time or more than 24 h from the first); approve, reject with required reason, or correct to the photo's reading; every action echoes the catch's `rev`, so a catch edited after the judge loaded it is refused and reloaded; **re-judge** (change a decision, with a reason) while the event is live or closed; no self-approval; audit row on every change, readable by the angler for their own catches.
4. **Finalize:** close after the final deadline, then lock the tournament (refused while anything is pending); results CSV and audit CSV built in the organizer's browser with the same scoring module; the SHA-256 of each **posted with the standings in the club group chat**; post-finalize backup; `archive-event.sh` copies the photos with a sha256 manifest to the **Proxmox host**, the **desktop** and the **laptop** pull and verify, and the photos are removed from the app outside the API once the desktop copy verifies ("Photo archived").

## Not doing (MVP)
Public spectator board · "Most impressive catch" vote · AI photo checker (M2, advisory only) · offline IndexedDB outbox · push notifications · AOY standings · DEC report export · disputes workflow · in-app messaging ("Ask the judge") · native apps · configurable scoring formats beyond the settings in `scoring.md`.

## Invariants (each has a test)
1. Scores come only from `web/src/lib/scoring.ts`, from verified catches, in integers (hundredths of an ounce; quarter-inches). Pending, rejected and retracted never count.
2. Only the server sets `status`, `judged_by`, `flags`, `reason`, `rev` and `created`. Create bodies containing them are rejected by the API rule.
3. No one changes the status of a catch on their own entry, except retracting it while pending. The backup judge can act only on the judge's catches, only in that tournament.
4. No location data is stored anywhere: original, added photos, thumbnails, backups, archive.
5. Every catch create or change writes an `audit_log` row; the audit log has no update or delete rule.
6. Nothing is deleted through the API, not even by the superuser (`decisions.md` 2026-11-16). Rejected and retracted catches stay, with their reason; withdrawn entries stay; photos are append-only.
7. Once a tournament is `final`, no catch or entry in it can change through the API.
8. Every read requires a signed-in member, even though Access sits in front (tests run as if Access did not exist).
9. The server's receive time is authoritative for the 24-hour and final deadlines; capture time is only a flag.

## Recovery targets
A 6-week window with a 24-hour submission rule makes short outages survivable: anglers keep the photo in their camera roll and submit later.
- **Restore service within 12 hours**; worst case restore from offsite within 24 hours.
- **Data loss at most 24 hours** (nightly backup); lost submissions are re-entered from the camera roll.
- If the app is down, the 24-hour rule and, for an outage in the last 24 hours, the final deadline stretch by the outage length (`scoring.md` §6, agreed by the group 1 Oct).
- The last 3 days of a window plus the 24-hour final deadline are the critical period (hard freeze, confirmed 1 Oct).

## Open questions
1. ~~**Photo visibility during a tournament.**~~ **Closed 2026-10-01:** every signed-in member sees every angler's photos; `photo` is a protected file (`decisions.md`, "Every signed-in member can see every angler's catch photos").
2. ~~**Ineligible species.**~~ **Closed 2026-10-01:** blocked at submission; the organizer can add species (`decisions.md`, "Ineligible species are blocked at submission"). `scoring.md` example 7 rewritten.
3. ~~**After submitting.**~~ **Closed 2026-10-01:** edit while pending with a `rev` counter; append-only photos; retract instead of delete; resubmitting after a rejection is a new catch (`decisions.md`, "An angler can edit their own catch while it is pending" and "Photos on a pending catch are append-only").
4. ~~**Entries.**~~ **Closed 2026-10-01:** members join themselves; removal is a `withdrawn` flag (`decisions.md`, "Members join a tournament themselves" and "Removing someone from a tournament sets a `withdrawn` flag").
5. ~~**Outage rule.**~~ **Closed 2026-10-01:** agreed by the group with `scoring.md` v0.4 §6; tested by R-EVT-U-12 to 14 and R-CAT-C-17 (`decisions.md`, outage rule and sign-off rows).
6. **Capture time:** client-side re-encoding drops EXIF, so the browser must read `DateTimeOriginal` before re-encoding (as trustworthy as EXIF itself, i.e. a signal only). Confirm in the photo spike, including iPhone HEIC (`features.json` M0-04). Tracked as `decisions.md` Open items #1.
7. ~~**DEC permit.**~~ **Closed 2026-10-07:** not being pursued (`decisions.md` 2026-10-01, which also says what reopens it). If that changes, the report needs per-day counts and dead fish by species, which means a kept/released field on catches.
8. ~~**Change control** and **offsite backup:** confirmed in `decisions.md` on 1 Oct (proposed hard freeze kept; B2, encrypted, host-pushed). Kept open until `ops.md` is updated to match.~~ **Closed 2026-10-06:** `ops.md` v0.6 §6 (change control) and §7 (encrypted B2 backups pushed by the host) match `decisions.md`.

## Top risks
| # | Risk | L / I | Response | Evidence |
|---|---|---|---|---|
| R1 | Scoring dispute | High / High | Group-agreed `scoring.md`; its examples are the tests | `test/scoring.test.ts` (fixtures for `web/src/lib/scoring.ts`) |
| R2 | API-rule hole (self-approval, backup judge overreach, role escalation, forged `status` or `rev`, deleting a photo) | Med / High | Rules matrix tested anonymously and per role against the pinned binary | `test/rules.test.ts` in CI |
| R3 | Location leak from photos, including photos added later | Med / High | Server strip or fail closed, proven by spike | 4 fixture tests |
| R4 | Leaderboard silently stale | Med / Med | Heartbeat, refetch on reconnect/visibility, status badge | 15-min soak via the tunnel |
| R5 | Outage near the final deadline | Low / High | Freeze last 3 days; outage rule; timed restore drill | `evidence/restore-*.txt` |
| R6 | Agent disarms guardrails or leaks secrets | Low / High | User-level guard hook, deny rules, sandbox, no prod creds on dev box | Hook blocks a test edit |
| R7 | Photos fill the disk over 6 weeks | Low / Med | Client resize; size cap; at most 4 photos per catch; disk alert | Upload size test |
| R8 | Bus factor of one | Med / High | Break-glass sheet, second recovery contact | Sheet handed over |
| R9 | A change breaks prod | Med / High | CI gate on every pull request; every green `main` build auto-deploys to a seed-data staging container first; prod gets the same bundle only by a manual tag and `deploy.sh`, with rollback (`decisions.md` L3) | Release-job and `deploy.sh --staging` tests (M0-05); a staging deploy and a failed one in `evidence/m0.txt` |
