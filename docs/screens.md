# Screens: Fishing Scoreboard (UI step 1, screen inventory)

**Status:** Draft v0.7, 7 Oct 2026. Text only: data, actions and states. No colors, layouts or components (the Figma file holds those).
**v0.7:** applies the Figma pass-3b review (`claude/review-figma-pass3.md` §5, in the Claude Project: all 130 rows have frames, §7.3) and Kayden's answers of 7 Oct 2026, recorded in `decisions.md`: Gap 19 values (8-digit code, 10 minutes, a new code after 60 s, 14-day token refreshed on open), Gap 37 (Club rules adds the tournament's values when opened from a tournament page). The open questions moved to `decisions.md` Open items; the status-word rule gained one sentence. Sources now use repo paths (`decisions.md` 2026-10-07: the repo is the source of truth).
**v0.6:** applies the independent review of 5 Oct 2026 and Kayden's answers, recorded in `decisions.md` 2026-10-05: new rows JDG-00a and JDG-00b (the Judge tab opens a Judging home), RULES-01a (Club rules), and a NOT SENT row for every change screen (MY-03c, MY-05c, JDG-02j, JDG-03b, JDG-04b, JDG-05c, ORG-04c, ORG-05c, ORG-06c, ORG-09c); the status-word rule and the tab rule in §0; JDG-02i reads the code word history stored on the event; JDG-01c wording; LB-01e places; test IDs from `security.md` v0.9 (Gap 33 settled); "Ask the judge" is out (messaging is on SPEC's Not doing list). 117 → 130 rows; the 13 new rows have no Figma frame yet (§7.3).
**v0.5:** applies Kayden's answers of 5 Oct 2026 (Figma pass 2), recorded in `decisions.md`: Gap 9 (name editable while live; once closed, only the backup judge), Gap 10 (`ends_at` later only, while the window is open), Gap 11 (Open preconditions enforced by the hook), Gap 15 (CSV format; hashed files only when final; unhashed preview while closed), Gap 16 (reload and infer the reason), Gap 17 (server clock offset), Gap 19 (neutral sign-in wording), Gap 20 (names always set; Join asks for one), Gap 21 (same angler and catch pages for everyone), Gap 25 (which screens update live), Gap 28 (members see an extension), Gap 31 (pending or verified). New row: EVT-02n (Join: name needed first). Later the same day (Kayden, `decisions.md`): `scoring.md` v0.6 is in force with no group vote; a backup judge named after close gets no entry; ORG-08c (Entries: empty, unreachable) dropped; exports gain "Share file and hash". Every row in section 2 has a Figma frame (117, scripted check of 5 Oct).
**v0.4:** applies Kayden's answers of 3 Oct 2026, recorded in `decisions.md`: `scoring.md` v0.5 agreed; home screen option A (a list) and landing with two live entries (Gap 29); judge queue filters (Gap 22); judge names from their entries (Gap 13); the withdraw reason shown (Gap 24); the code word can change while live and the judge can only step down, with the backup taking over (Gap 9, details open); "Photo archived" from finalize (Gap 32). New rows: EVT-01d, JDG-01f, JDG-01g, JDG-02i.
**v0.3:** applies Kayden's answers of 2 Oct 2026, recorded in `decisions.md`, `security.md` v0.6 and the `scoring.md` v0.5 draft:
- two required, labelled photos (group sign-off pending);
- anglers echo `rev`;
- a correction approves the catch;
- a reason on any re-judge;
- fixed audit snapshots;
- capture-time checks on every photo after the first;
- the code word in either required photo;
- the judge must be an organizer, and the judge and backup judge are entered automatically when the event is created (`security.md` v0.7);
- the backup judge sees the judge's withdrawn entry; no judge handover in the MVP (`security.md` v0.8);
- display decisions: measurement input, times shown, judge queue, club time, landing, leaderboard detail.

Gaps 2, 3, 8, 12, 14, 18, 23, 26, 27, 30, 35 and 36 are settled; Gaps 22 and 29 are partly settled.
**v0.2:** applied Kayden's answers of 1 Oct 2026 (Gaps 1, 4, 5, 6, 7; LB-03).
**Built from:** `SPEC.md` v0.2, `security.md` v0.8, `scoring.md` v0.5 draft (v0.4 agreed), `decisions.md` (entries through 2026-10-02), `claude/features.json`, `claude/architecture.md` v0.4, `claude/ops.md` v0.5. `dev-lifecycle-guide.md` read as background only (its conflicts are listed in 5, item 34, and never used as a source).
**Precedence:** `SPEC.md`, `security.md` and `decisions.md` win. Where docs disagree, the conflict is listed in section 5 rather than resolved here.

---

## 0. Conventions

**Who sees it**
- **M**: any signed-in user acting as an angler on their own entry. This includes J, S and K when they fish (R-ENT-C-08, R-CAT-C-18, R-ALL-S-01).
- **J**: judge of this tournament (`events.judge`).
- **S**: backup judge of this tournament (`events.backup_judge`).
- **K**: `users.role = organizer`.
- **anon**: no PocketBase session (has already passed Cloudflare Access).

**Event status and live phases.** `draft`, `live`, `closed`, `final`. `live` is split by server time, because different actions open and close inside it:

| Phase | Condition | Join | Submit | Angler edit / add photo / retract |
|---|---|---|---|---|
| live:pre | now < `starts_at` | Yes (R-ENT-C-01) | No (R-CAT-C-06) | n/a |
| live:window | `starts_at` ≤ now ≤ `ends_at` | Yes | Yes (R-CAT-C-01) | Yes (R-CAT-U-16, U-21, U-29) |
| live:late | `ends_at` < now ≤ `submit_deadline` | Yes | Yes, flagged if caught after `ends_at` (R-CAT-C-17) | Yes |
| live:over | now > `submit_deadline`, not yet closed | No (R-ENT-C-05) | No (R-CAT-C-07) | No (R-CAT-U-19, U-30) |

"live:open" means pre, window or late. "Now" is the phone's time corrected by its offset from the server's `Date` header (Gap 17, settled 2026-10-05).

**Entry state:** none (not joined); active (`withdrawn = false`); withdrawn-self (`withdrawn_by` = the angler); withdrawn-by-K (`withdrawn_by` ≠ the angler).
**Catch state:** `pending` (editable during live:window and live:late on an active entry, otherwise locked), `verified`, `rejected`, `retracted`.

**Units**
- **[W]** weight from `weight_hoz`, in the viewer's `display_units`: `lb` shows decimal pounds to 0.01 lb; `lb_oz` shows pounds and ounces to 0.1 oz (`scoring.md` §4, examples 5 and 16). Scoring always uses the exact integer.
- **[L]** length from `length_q`, shown as inches and quarter-inches (70 → 17 1/2 in) (`scoring.md` §4, example 6). `display_units` never changes lengths.
- Weight **entry** offers both formats regardless of `display_units` (`scoring.md` §4).

**Sources.** SPEC = `SPEC.md`; SEC = `security.md` (named by collection); SCO = `scoring.md` (§ or example); DEC = `decisions.md` (date and entry); FEAT = `features.json` (slice and step number); ARCH = `architecture.md`; OPS = `ops.md`.

**Facts that hold on every screen**
- No location data exists in any field or file (invariant 4), so no screen shows location.
- Members never see another angler's `rejected` or `retracted` catch, or any catch on someone else's withdrawn entry (R-CAT-L-03, L-07, L-10, V-01, F-03).
- Members can't read other `users` records (R-USR-V-01). Other people's names come only from `entries.display_name`.
- On a `final` event every photo shows "Photo archived" and the app never requests the file (FEAT S4 step 8; ARCH §4b).
- `created` (server receive time) is authoritative; `captured_at` is a signal only (invariant 9).
- **Times** are always shown in club time (America/New_York), the same on every phone whatever its own setting, in 12-hour format (DEC "Display decisions for the UI").
- **Photo slots** (`scoring.md` v0.5 §5, agreed 3 Oct 2026): photo 1 is "Holding the fish", photo 2 is "On the scale" (weight) or "On the board" (length); photos 3 and 4 are optional extras. Photos are append-only, so wherever photos are shown, the first two carry these labels.
- Every angler change (edit, add photos, retract) and every judge action sends back the `rev` the screen loaded; a stale `rev` is refused and the screen reloads (R-CAT-U-13, U-39).
- **Refusals** reload the record and event and say what changed, inferred from `status`, `rev`, `submit_deadline`, `withdrawn` and the event status (Gap 16, settled 2026-10-05).
- **No reply** (DEC 2026-10-05 "No reply on any change"). Any change that gets no reply (submit, edit, add photos, retract, a judge decision, an organizer action) shows NOT SENT with Retry and keeps the inputs, locked. Retry reloads the record first: if it already shows the change, the screen says it was saved and sends nothing; if it changed in some other way, the screen's refused state shows (Gap 16); otherwise it resends. NOT SENT (no reply) stays separate from Not accepted (refused).
- **Status words** (DEC 2026-10-05 "Event status and the live badge use different words"). The event status chip shows `events.status`: Draft, Live, Closed or Final. The realtime badge (Live, Reconnecting, Updated h:mm) appears only on screens that update live (Gap 25): LB-01 (not when final), JDG-01 and the counts on ORG-01. Nowhere else does the word "Live" describe data, so list-link details say "You're 4th", not "Live · you're 4th".
- **Tabs.** The Judge tab shows when the viewer is `events.judge` or `events.backup_judge` of any live or closed tournament, and opens JDG-00a (DEC 2026-10-05 "The Judge tab opens a Judging home"). Every EVT-01 and EVT-02 screen has a Club rules link (→ RULES-01a). There is no "Ask the judge" control: in-app messaging is out of the MVP (DEC 2026-10-05).
- "Gap n" points to section 5.

---

## 1. Screen list

| ID | Screen | Purpose |
|---|---|---|
| AUTH-00 | Cloudflare Access login | Not designed here. The step before AUTH-01 (Access PIN by email) |
| AUTH-01 | Sign in: email | Request a PocketBase OTP code |
| AUTH-02 | Sign in: code | Enter the OTP code; wrong and expired code |
| EVT-01 | Home / Tournaments | Landing screen for anyone without exactly one active entry in a live tournament; a list of the tournaments the viewer can see, their active ones first (option A, DEC 2026-10-03) |
| EVT-02 | Tournament | One tournament: status, deadlines, the viewer's entry, and links to submit, catches, leaderboard, queue, manage |
| EVT-03 | Withdraw (self) | Confirm withdrawing your own entry |
| SUB-01 | Submit a catch | Species, measurement, the two required photos and up to 2 more for one fish |
| SUB-02 | Submission status | Sending / Received / NOT SENT + Retry / duplicate / not accepted |
| MY-01 | My catches | The angler's own catches in one tournament, every status |
| MY-02 | My catch | One own catch: state, photos, and what can still be done |
| MY-03 | Edit pending catch | Change species and measurement while pending |
| MY-04 | Add photos | Append photos to a pending catch, up to 4 in total |
| MY-05 | Retract | Confirm retracting a pending catch |
| MY-06 | Catch history | The angler's audit trail for one own catch |
| LB-01 | Leaderboard | Live standings for one tournament |
| LB-02 | Angler's catches | Another angler's visible catches and photos (DEC photo visibility) |
| LB-03 | Catch detail | One visible catch by another angler, with its photos and a timeline of what happened to it (DEC public catch history) |
| JDG-00 | Judging | The Judge tab: every live or closed tournament the viewer judges, stacked |
| JDG-01 | Judge queue | Catches the viewer may judge in one tournament, with flags |
| JDG-02 | Review catch | One catch in full, with the judge's actions |
| JDG-03 | Reject | Reason entry for a rejection |
| JDG-04 | Correct | Correct species or measurement to the photo's reading, with a reason; this approves the catch |
| JDG-05 | Re-judge | Change an earlier decision, with a reason |
| ORG-01 | Manage tournament | Organizer's lifecycle view: edit, open, extend, close, finalize, exports |
| ORG-02 | Create / edit draft | All event fields while `draft` |
| ORG-03 | Edit live tournament | The fields that may still change once live |
| ORG-04 | Extend final deadline | Outage extension (`deadline_ext_min`) |
| ORG-05 | Close | live → closed |
| ORG-06 | Finalize | closed → final |
| ORG-07 | Exports | Results CSV and audit CSV with their SHA-256 |
| ORG-08 | Entries | Every entry in a tournament, including withdrawn |
| ORG-09 | Withdraw or reinstate an angler | Organizer withdraw-with-reason and reinstate |
| ORG-10 | Species | List species, add one |
| PRF-01 | Profile | Own name and display units |
| RULES-01 | Club rules | The upload rules and limits, read only |
| SYS-01 | Offline | No connection |
| SYS-02 | Not found / not allowed | A record or screen the viewer may not see |
| SYS-03 | Locked | A change refused because the event is final |
| SYS-04 | Session ended | PocketBase session no longer valid |

**Count:** 38 screens designed here (AUTH-00 is listed but out of scope), in 130 state rows (section 2).

---

## 2. Screen × role × state table

One row per distinct state. The table is split by area; the columns are the same throughout.

### 2.1 Sign-in

| ID | Screen | Who sees it | Event status | Entry/catch state | Data shown | Actions available | Actions NOT shown and why | Rule / test IDs | Source |
|---|---|---|---|---|---|---|---|---|---|
| AUTH-01a | Sign in: email | anon | n/a | — | Email field | Request a sign-in code | Password sign-in, sign-up, OAuth2: OTP is the only method (R-USR-A-01, R-USR-C-01) | `users` auth settings (OTP on); R-USR-A-01 | SEC users "Auth settings"; DEC L1 §2; SPEC Must 1 |
| AUTH-01b | Sign in: email, no such user | anon | n/a | Email has no PocketBase user | The same as AUTH-02a: "If that email is registered, a code is on its way" (Gap 19, settled 2026-10-05); any code entered then fails as AUTH-02b | Change email; enter a code | Create an account (R-USR-C-01); anything that reveals whether the email is a member | R-USR-A-02 | SEC users; DEC 2026-10-05 sign-in wording |
| AUTH-02a | Sign in: code | anon | n/a | Code requested | Email the code went to; code field | Submit code; Send a new code (offered after 60 s); use a different email (→ AUTH-01) | — | `users` auth settings (OTP on) | SEC users; DEC L1; DEC 2026-10-07 sign-in values |
| AUTH-02b | Sign in: wrong code | anon | n/a | Code not accepted | Error: code not accepted; field kept for another try (tries are rate-limited: OPS §14, Gap 19) | Try again; request a new code (→ AUTH-01) | — | `users` auth settings | SEC users; FEAT S1 step 2 |
| AUTH-02c | Sign in: expired code | anon | n/a | Code expired | Error: code expired (a code lasts 10 minutes: Gap 19) | Request a new code (→ AUTH-01) | Submitting the same code again | `users` auth settings | SEC users; FEAT S1 step 2 |

### 2.2 Tournaments and the tournament page

| ID | Screen | Who sees it | Event status | Entry/catch state | Data shown | Actions available | Actions NOT shown and why | Rule / test IDs | Source |
|---|---|---|---|---|---|---|---|---|---|
| EVT-01a | Tournaments | M, J, S | live, closed, final | Per event: none, active or withdrawn | Per event: `name`, `status`, `starts_at`, `ends_at`, `submit_deadline`, `metric`; own entry state from `entries.withdrawn` | Open a tournament (→ EVT-02); Profile (→ PRF-01) | Drafts (R-EVT-L-02, V-01); New tournament (R-EVT-C-02) | R-EVT-L-02, R-ENT-L-02, R-ENT-L-04 | SEC events, entries |
| EVT-01b | Tournaments | K | draft, live, closed, final | Same | Same, drafts included and marked as draft | Open; New tournament (→ ORG-02); Species (→ ORG-10); Profile | — | R-EVT-L-03, R-EVT-C-01, R-SPC-C-01 | SEC events; FEAT S4 step 1 |
| EVT-01d | Tournaments: two live entries | M, J, S | live (two or more) | Active entries in two or more live tournaments | "Your tournaments": each live tournament with an active entry, with its pending count and the viewer's place; then other live tournaments and past ones | Open a tournament (→ EVT-02); its leaderboard (→ LB-01) | — | R-EVT-L-02, R-ENT-L-02 | DEC 2026-10-03 "Home screen and landing" |
| EVT-01c | Tournaments: empty | M, J, S (none live/closed/final); K (none at all) | — | — | "No tournaments yet" | K: New tournament. Everyone: Profile | M: nothing else to open | R-EVT-L-02, L-03 | SEC events |
| EVT-02a | Tournament | M | live:open | none | `name`, `status`, `starts_at`, `ends_at`, `submit_deadline`, `metric`, `best_n`, `species` names; judge and backup judge named from their entries' `display_name` (role alone if that entry is withdrawn: Gap 13) | Join (→ EVT-02n first if the viewer's name is empty); Leaderboard (→ LB-01) | Submit (no own entry: R-CAT-C-02) | R-ENT-C-01; S, N: R-ALL-S-01. The event's judge and backup judge never see this row: they were entered when the event was created and start in the active rows (R-EVT-C-08, R-ENT-C-08) | SPEC roles; SCO §3; DEC "Members join a tournament themselves", "Judge must be an organizer; judge and backup judge are entered automatically" |
| EVT-02b | Tournament | M | live:over, closed, final | none | Same as EVT-02a | Leaderboard | Join (R-ENT-C-05 after `submit_deadline`; R-ENT-C-04 closed or final) | R-EVT-L-02 | SCO §3 |
| EVT-02c | Tournament | M | live:pre | active | Same + "Fishing window opens `starts_at`" | My catches (→ MY-01); Leaderboard; Withdraw (→ EVT-03) | Submit (R-CAT-C-06); Join again (R-ENT-C-03) | R-ENT-U-01 | SEC catches create rule |
| EVT-02d | Tournament | M | live:window | active | Same + own catch counts by `status` | Submit a catch (→ SUB-01); My catches; Leaderboard; Withdraw | Join again (R-ENT-C-03) | R-CAT-C-01, C-18, R-ENT-U-01 | SPEC Must 1 |
| EVT-02e | Tournament | M | live:late | active | Same + "Window closed at `ends_at`; submissions accepted until `submit_deadline`; fish caught after `ends_at` don't count"; when `deadline_ext_min` > 0, "extended by n h after an outage" beside the deadline (Gap 28) | Submit a catch; My catches; Leaderboard; Withdraw | — | R-CAT-C-01, C-17 | SCO §6, example 23; DEC 2026-10-05 |
| EVT-02f | Tournament | M | live:over | active | Same + "Submissions closed at `submit_deadline`" (with the extension note when extended, Gap 28) | My catches; Leaderboard; Withdraw | Submit (R-CAT-C-07); edit, add photos, retract (R-CAT-U-19, U-30) | R-ENT-U-01 | SCO §6 |
| EVT-02g | Tournament | M | closed | active | Same + "Closed; judging continues" | My catches; Leaderboard; Withdraw | Submit (R-CAT-C-08); rejoin after a later withdrawal (R-ENT-U-05) | R-ENT-U-02 | SCO §3 |
| EVT-02h | Tournament | M | live:open | withdrawn-self | "You withdrew"; not on the leaderboard; catches kept; pending catches still judged | Rejoin; My catches; Leaderboard | Submit (R-CAT-C-14); edit, add photos, retract (R-CAT-U-23) | R-ENT-U-03, R-ENT-L-04 | SCO §3, example 19 |
| EVT-02i | Tournament | M | live:over, closed | withdrawn-self | Same + "Rejoining has closed" | My catches; Leaderboard | Rejoin (R-ENT-U-05) | R-ENT-L-04 | SCO §3 |
| EVT-02j | Tournament | M | live, closed | withdrawn-by-K | "Withdrawn by the organizer" with `withdraw_reason` (Gap 24) | My catches; Leaderboard | Rejoin (R-ENT-U-04) | R-ENT-L-04 | SEC entries; DEC "Removing someone … sets a `withdrawn` flag" |
| EVT-02k | Tournament | M | final | any | "Final"; standings as published | My catches (read only); Leaderboard | Join, withdraw, rejoin (R-ENT-C-04, R-ENT-U-10); any catch change (R-CAT-U-12) | R-EVT-L-02 | SPEC invariant 7 |
| EVT-02l | Tournament (judge additions) | J, S, on top of their M row (their entry exists from the event's creation unless they withdrew) | live, closed | any | + count of pending catches the viewer may judge | Judge queue (→ JDG-01) | Judge queue on a final event (R-CAT-U-12) | R-CAT-L-05, L-06 | FEAT S3 step 1 |
| EVT-02m | Tournament (organizer additions) | K, on top of their M row | draft, live, closed, final | any | + Manage | Manage (→ ORG-01); Entries (→ ORG-08) | Join a draft (R-ENT-C-04) | R-EVT-L-03, R-ENT-L-05 | FEAT S4 step 1 |
| EVT-02n | Join: name needed first | M | live:open | none; the viewer's `users.name` is empty | A sheet: "Add your name first"; a name field; "Your name shows on the leaderboard and on your catches" | Save and join (saves `name` to the profile, then joins); Cancel | Joining with an empty name | R-USR-U-01, R-ENT-C-01 | DEC 2026-10-05 "No blank names on the board" (Gap 20) |
| EVT-03a | Withdraw (self) | M | live:open | active | What withdrawing does: off the leaderboard; entry and catches kept; pending catches still judged but can't be edited; you can rejoin until `submit_deadline` | Confirm withdraw; Cancel | Reason field (an angler can't set `withdraw_reason`: entries update rule) | R-ENT-U-01, U-03 | SCO §3 |
| EVT-03b | Withdraw (self) | M | live:over, closed | active | Same, but "You won't be able to rejoin" | Confirm withdraw; Cancel | — | R-ENT-U-01, U-02, U-05 | SCO §3 |

### 2.3 Submit

| ID | Screen | Who sees it | Event status | Entry/catch state | Data shown | Actions available | Actions NOT shown and why | Rule / test IDs | Source |
|---|---|---|---|---|---|---|---|---|---|
| SUB-01a | Submit a catch (weight) | M, including J, S, K on their own entry | live:window, live:late | active; `metric = weight` | Tournament `name`; species choices = this event's `species` only; weight entry [W] as decimal pounds to two places (`0.00`) or pounds + ounces with ounces to one place; two required photo slots, "Holding the fish" and "On the scale", plus up to 2 optional extras; `code_word` when `code_word_on`, with "Show this word on a card in either required photo". Before re-encoding, the browser reads the first photo's capture time as `captured_at` and every photo's capture time into `photo_captured_at`; neither is shown on this screen. Every photo after the first is checked against the first and may be flagged (`extra_photo_no_time`, `extra_photo_far`), never refused | Choose species; enter weight; fill both required slots; add up to 2 extras; Send (only once both required slots are filled) | Send with a required slot empty (R-CAT-C-21); species outside the list, e.g. walleye in E1 (R-CAT-C-09); length field (R-CAT-C-12); `status`, `judged_by`, `reason`, `flags`, `rev` (R-CAT-C-03 to C-05, C-15); a 5th photo (schema max 4) | R-CAT-C-01, C-09, C-12, C-16, C-18, C-19, C-20, C-21, C-22 | SPEC Must 1; SCO §2, §4, §5, §6; FEAT S1 steps 9, 12 |
| SUB-01b | Submit a catch (length) | Same | live:window, live:late | active; `metric = length` | Same, with length entry [L], entered to the eighth inch, with the rounded-down quarter-inch value shown before sending (17 5/8 → 17 1/2); the second required slot is labelled "On the board" | Same, entering length | Weight field (R-CAT-C-13) | R-CAT-C-01, C-13, C-21 | SCO §4, example 6; FEAT S1 step 10 |
| SUB-01c | Submit a catch (after window) | Same | live:late | active | + "Window closed at `ends_at`; a fish caught after it is flagged and doesn't count" (with the extension note when extended, Gap 28) | Send | — | R-CAT-C-01, C-17 | SCO §6, example 23 |
| SUB-01d | Submit: incomplete | Same | live:window, live:late | active | Which input is missing or invalid: either required photo missing ("Holding the fish", "On the scale" or "On the board"); measurement missing or ≤ 0; file not JPEG after re-encoding, or over 5 MB after resizing to a 2560 px long edge | Fix the inputs | Send, until valid | R-CAT-C-12, C-13, C-16, C-21 | SPEC Must 1 |
| SUB-01e | Submit: not available | M | draft, live:pre, live:over, closed, final; or entry none or withdrawn | — | Why submitting is closed: window not open yet, deadline passed, event not live, not joined, or withdrawn | Back to the tournament (→ EVT-02) | Send (R-CAT-C-06, C-07, C-08, C-02, C-14) | R-CAT-C-06, C-07, C-08, C-02, C-14 | SEC catches create rule |
| SUB-02a | Submission status: Sending | M | live:window, live:late | Request in flight | "Sending"; the catch as entered | — (wait) | A second Send: the same `client_uuid` is kept for any resend | R-CAT-C-10 | SPEC Must 1; FEAT S1 step 13; ARCH §4 |
| SUB-02b | Submission status: Received | M | live:window, live:late | `pending` | "Received"; `species`, measurement [W] or [L], photo count, `created` | View the catch (→ MY-02); Submit another (→ SUB-01); Tournament (→ EVT-02) | — | R-CAT-C-01 | ARCH §4 |
| SUB-02c | Submission status: NOT SENT | M | live:window, live:late | No server reply (offline, timeout, error) | "NOT SENT"; the catch as entered; "Your photo is still in your camera roll" | Retry (same `client_uuid`); a warning if the angler tries to leave | Save for later (offline outbox is SPEC "Not doing"); editing the catch while NOT SENT (the form is locked, so a retry can't silently drop a change: DEC 2026-10-02) | R-CAT-C-10 | FEAT S1 step 13; SPEC Not doing |
| SUB-02d | Submission status: already received | M | live:window, live:late | Retry hit the unique index; the catch is found by `client_uuid` | "Received" with the stored catch's values | View the catch (→ MY-02) | Sending again | R-CAT-C-10, R-CAT-L-02 | ARCH §4; FEAT S1 step 13 |
| SUB-02e | Submission status: not accepted | M | Deadline passed, event closed, or entry withdrawn while sending | Server refused; the rule gives no reason | "Not accepted"; the reason inferred from the event and entry state after a reload (Gap 16, settled) | Back to the tournament (→ EVT-02) | Retry (the same request is refused again) | R-CAT-C-07, C-08, C-14 | SEC conventions "What Deny means" |

### 2.4 My catches

| ID | Screen | Who sees it | Event status | Entry/catch state | Data shown | Actions available | Actions NOT shown and why | Rule / test IDs | Source |
|---|---|---|---|---|---|---|---|---|---|
| MY-01a | My catches: empty | M | live, closed, final | Entry active or withdrawn; no catches | "Nothing submitted yet" | Submit (only in EVT-02d or EVT-02e states) | — | catches list rule (angler branch); R-CAT-C-01 | SEC catches |
| MY-01b | My catches | M | live, closed | Entry exists; ≥ 1 catch | Own catches in this event, every status: `species`, measurement [W] or [L], `status`, `created`, first photo, `reason` on rejected; verified catches in the counted best 10 marked | Open (→ MY-02); Submit (EVT-02d or EVT-02e states only) | — | R-CAT-L-02, L-04, L-11, L-12 | SCO §6, §9 |
| MY-01c | My catches | M | final | any | Same; photos replaced by "Photo archived" | Open (→ MY-02) | Any change (R-CAT-U-12) | R-CAT-L-04, R-CAT-U-12 | FEAT S4 step 8 |
| MY-02a | My catch: pending, editable | M | live:window, live:late | `pending`; entry active; < 4 photos | `species`, measurement [W] or [L], every photo (n of 4), "Pending"; submitted time (`created`) and, when available, photo time (`captured_at`); no flag codes | Edit (→ MY-03); Add photos (→ MY-04); Retract (→ MY-05); History (→ MY-06) | Delete (R-CAT-D-01); remove or replace a photo (R-CAT-U-26); change `captured_at` (R-CAT-U-28); approve own (R-CAT-U-06, U-10) | R-CAT-U-16, U-21, U-29, U-39, R-AUD-L-02 | SPEC Must 1; DEC "edit … while it is pending", "Photos … are append-only" |
| MY-02b | My catch: pending, 4 photos | M | live:window, live:late | `pending`; entry active; 4 photos | Same | Edit; Retract; History | Add photos (R-CAT-U-27) | R-CAT-U-16, U-29 | SCO §5 |
| MY-02c | My catch: pending, locked by time | M | live:over, closed | `pending` | Same + "Waiting for the judge" | History | Edit, add photos, retract (R-CAT-U-19, U-30) | R-AUD-L-02 | SCO §6 |
| MY-02d | My catch: pending, entry withdrawn | M | live, closed | `pending`; entry withdrawn | Same + "You've withdrawn: this catch is still judged but can't be changed" | History | Edit, add photos, retract (R-CAT-U-23; update rule requires `entry.withdrawn = false`) | R-ENT-L-04, R-AUD-L-02 | SCO §3 |
| MY-02e | My catch: verified | M | live, closed | `verified` | `species`, measurement (current value), "Verified", decided by (labelled Judge or Backup judge), `reason` if the judge gave one (everyone can read it: DEC public catch history) | History | Edit, add photos, retract (R-CAT-U-18, U-30) | R-AUD-L-02 | SCO §7 |
| MY-02f | My catch: verified, corrected | M | live, closed | `verified`, with a `correct` audit row | Same + "Corrected by the judge"; before → after is in MY-06 | History | Same as MY-02e | R-AUD-L-02, R-CAT-U-04 | SCO examples 15, 21; DEC "Anglers can read the audit-log rows for their own catches" |
| MY-02g | My catch: rejected | M | live, closed | `rejected` | "Rejected"; `reason` (always present) | History; Submit a new catch (→ SUB-01, only in EVT-02d or EVT-02e states; it may be flagged > 24 h and the judge decides case by case) | Edit, retract (R-CAT-U-18, U-30) | R-CAT-L-04, R-CAT-C-01 | SCO §6 "After a rejection", §7; DEC late resubmission |
| MY-02h | My catch: retracted | M | live, closed | `retracted` | "Retracted: never scores; other members can't see it" | History | Un-retract (R-CAT-U-32); edit (R-CAT-U-18) | R-CAT-U-29 | SCO §6, example 20 |
| MY-02i | My catch: final | M | final | any | Same as the matching status row; photos replaced by "Photo archived" | History | Any change (R-CAT-U-12) | R-CAT-U-12 | FEAT S4 step 8 |
| MY-03a | Edit pending catch | M | live:window, live:late | `pending`; entry active | `species` (this event's list only) and measurement ([W] in either format, or [L], with the same inputs as SUB-01), current values filled in | Save (sends the loaded `rev`); Cancel | `captured_at` (R-CAT-U-28); `status`, `reason`, or changing `rev` (R-CAT-U-20); the other metric's field (R-CAT-U-24); species outside the list (R-CAT-U-17) | R-CAT-U-16, U-17, U-24, U-39, R-AUD-H-01 | SPEC Must 1; SCO §6 |
| MY-03b | Edit refused | M | live, closed | Judged, deadline passed, withdrawn, or changed elsewhere (stale `rev`) since the screen opened | The catch reloaded in its new state, with the reason inferred (Gap 16, settled) | Back (→ MY-02) | Save again | R-CAT-U-18, U-19, U-23, U-39 | SEC catches update rule |
| MY-03c | Edit: NOT SENT | M | live:window, live:late | No server reply to Save | "NOT SENT"; the edit as entered, locked | Retry: reloads the catch first; if it already shows the edit, says it was saved and sends nothing; if it changed in another way, → MY-03b; otherwise resends with the current `rev`. Cancel (→ MY-02) | Changing the edit while NOT SENT | R-CAT-U-16, U-39 | DEC 2026-10-05 "No reply on any change"; DEC 2026-10-02 "Every angler change echoes `rev`" |
| MY-04a | Add photos | M | live:window, live:late | `pending`; entry active; n < 4 photos | Existing photos, the first two labelled (kept; can't be removed); free extra slots (4 − n); "Adding a photo flags the catch for the judge". Each added photo's capture time is read before re-encoding and appended to `photo_captured_at`; a missing time, or one more than 24 h from `captured_at`, adds `extra_photo_no_time` or `extra_photo_far` (never a refusal) | Choose up to 4 − n photos; Upload (sends the loaded `rev`) | Remove or replace (R-CAT-U-26); more than 4 in total (R-CAT-U-27); changing an earlier capture time (R-CAT-U-36) | R-CAT-U-21, U-26, U-27, U-34, U-35, U-36, U-39, U-40 | SCO §5; DEC "Photos … are append-only", "Capture time per photo" |
| MY-04b | Add photos: NOT SENT | M | live:window, live:late | No server reply | "NOT SENT" | Retry: the app first reloads the catch; if `rev` and the photo count moved, the photo already landed and nothing is resent; otherwise it resends with the current `rev`. A duplicate is refused either way | — | R-CAT-U-21, U-39, U-40 | FEAT S1 step 13 |
| MY-04c | Add photos: refused | M | live, closed | Not an image, over the cap, a 5th photo, judged, deadline passed, or stale `rev` | The catch reloaded; why it was refused, inferred (Gap 16, settled) | Back (→ MY-02) | Upload again unchanged | R-CAT-U-27, U-18, U-19, U-39 | SEC catches hooks |
| MY-05a | Retract | M | live:window, live:late | `pending`; entry active | "This can't be undone. It never scores, other members won't see it, it stays on record. Submit a new catch to replace it." | Confirm retract (sends the loaded `rev`); Cancel | — | R-CAT-U-29, U-32, U-39 | SCO §6, example 20 |
| MY-05b | Retract refused | M | live, closed | Judged, deadline passed, or changed elsewhere (stale `rev`) since the screen opened | The catch reloaded, with the reason inferred (Gap 16, settled) | Back (→ MY-02) | Retract again | R-CAT-U-30, U-39 | SEC catches |
| MY-05c | Retract: NOT SENT | M | live:window, live:late | No server reply to Confirm retract | "NOT SENT" | Retry: reloads the catch first; if `status` is already `retracted`, says so and sends nothing; if it changed in another way, → MY-05b; otherwise resends with the current `rev`. Cancel (→ MY-02) | — | R-CAT-U-29, U-39 | DEC 2026-10-05 "No reply on any change" |
| MY-06a | Catch history | M | live, closed, final | Own catch, any status | `audit_log` rows whose `catch` is this catch: `action` (create, edit, retract, approve, reject, correct), `actor` labelled You, Judge, Backup judge or Organizer by comparing IDs, `created`, and what changed, worked out by comparing the fixed `before` and `after` snapshots (`species`, `weight_hoz`, `length_q`, `status`, `reason`, photos, `photo_captured_at`, `flags`, `rev`). While the catch is pending or verified, other members see the same timeline on LB-03 | — (read only) | Event and entry rows (R-AUD-L-03) | R-AUD-L-02, L-03, L-09, H-05 | DEC "Anglers can read the audit-log rows for their own catches", "Catch history is public to members", "Audit rows store a fixed snapshot"; SPEC Must 3 |

### 2.5 Leaderboard

| ID | Screen | Who sees it | Event status | Entry/catch state | Data shown | Actions available | Actions NOT shown and why | Rule / test IDs | Source |
|---|---|---|---|---|---|---|---|---|---|
| LB-01a | Leaderboard: live | M, J, S, K | live | ≥ 1 angler qualifies | One row per entry with `withdrawn = false` and ≥ 1 pending or verified catch (Gap 31, settled): place (shared places; the next place is skipped), `display_name`, total [W] or [L], counted fish (of `best_n`), biggest fish [W] or [L] with its species, pending count; a crown on every row in 1st place (shared 1st included) once the leader has a verified fish, and on the viewer's "Your place" card when they're 1st (DEC 2026-10-05). Computed in the browser by `web/src/lib/scoring.ts` from verified catches only; rejected, retracted and withdrawn are left out even for viewers who can read them (J, S, K, the viewer's own withdrawn entry). Badge: Live | Open a row (→ LB-02) | — | R-CAT-L-02, L-07, L-10, R-ENT-L-02, L-03, R-CAT-L-09, R-USR-U-01 | SPEC Must 2; SCO §1, §8, §9; FEAT S2 steps 2–10 |
| LB-01b | Leaderboard: reconnecting | M, J, S, K | live, closed | Realtime stream lost | Last standings kept; badge Reconnecting; full refetch on `PB_CONNECT` and when the tab becomes visible; a full page reload after repeated network failures, so an expired Access session can prompt (Gap 19) | — | — | FEAT S2 step 10 (no test ID) | ARCH §4; SPEC risk R4 |
| LB-01c | Leaderboard: polling | M, J, S, K | live, closed | No message for 150 s | Badge "updated hh:mm"; polls every 30 s until the stream returns | — | — | FEAT S2 step 10 (no test ID) | ARCH §4 |
| LB-01d | Leaderboard: empty | M, J, S, K | live | No angler qualifies | "No catches yet" | Submit (EVT-02d or EVT-02e states only) | — | R-CAT-L-02 | SCO §9 |
| LB-01e | Leaderboard: viewer withdrawn | M | live, closed | Viewer's entry withdrawn | Standings without the viewer; places recomputed, so the anglers below move up (SCO example 19) | Open a row | — | R-ENT-L-04 | SCO example 19 |
| LB-01f | Leaderboard: closed | M, J, S, K | closed | — | As LB-01a, still updating live (re-judging can change places) | Open a row | — | R-CAT-U-11 | SCO §7, example 21 |
| LB-01g | Leaderboard: final | M, J, S, K | final | — | Final standings; `display_name` as published; the crown stays on the winner's row; no Live badge (Gap 25, settled) | Open a row | — | R-USR-U-06, R-CAT-U-12 | SCO §9; DEC name sync |
| LB-02a | Angler's catches | M, J, S, K | live, closed | Target entry active | That angler's pending and verified catches: `species`, measurement [W] or [L], `status`, submitted time (`created`) and, when available, photo time (`captured_at`), photos (file token); no flag codes. Catches in their counted best 10 are marked | Open a catch (→ LB-03); view a photo full size | Their rejected and retracted catches (R-CAT-L-03, L-10, V-01, F-03) | R-CAT-L-02, R-CAT-F-01, F-02 | DEC photo visibility; SCO §9 |
| LB-02b | Angler's catches: final | M, J, S, K | final | — | Same; "Photo archived" | Open a catch (→ LB-03) | Any photo request (FEAT S4 step 8) | R-CAT-L-02 | FEAT S4 step 8 |
| LB-02c | Angler's catches: judge or organizer viewing | J, S, K | live, closed | Target has rejected or retracted catches the viewer may read | The same page as LB-02a: pending and verified only (Gap 21, settled 2026-10-05). Judges find rejected catches with the queue's Rejected filter | Open a catch (→ LB-03); view a photo full size | The extra rejected and retracted catches (same page for everyone) | R-CAT-L-05, L-06, L-08 | SEC catches list rule; DEC 2026-10-05 |
| LB-03a | Catch detail | M, J, S, K | live, closed | Another angler's `pending` or `verified` catch on an active entry | `display_name`, `species`, measurement [W] or [L], `status`, `created`, every photo (file token), the first two labelled. Timeline from `audit_log`, one line per row with its `created`: submitted, edited, photo added, rejected (with `reason`), re-approved (with `reason`), corrected (approves; with `reason`), approved. Each line shows what changed, from the fixed `before` / `after` snapshots. Actors labelled Angler, Judge, Backup judge or Organizer by comparing IDs. Submitted time and, when available, photo time; flag codes aren't shown (judges see them on JDG-02) | View a photo full size | Any change: not the viewer's catch (R-CAT-U-22, U-10); the page of a catch that is now rejected or retracted, or on a withdrawn entry (R-CAT-V-01, R-AUD-L-06) | R-CAT-L-02, R-CAT-F-02, R-AUD-L-02, L-07, H-05 | DEC "Catch history is public to members", "Audit rows store a fixed snapshot" |
| LB-03b | Catch detail: final | M, J, S, K | final | Same | Same; photos replaced by "Photo archived"; timeline unchanged | — | Any change (R-CAT-U-12) | R-AUD-L-02, R-CAT-U-12 | FEAT S4 step 8 |

### 2.6 Judging

| ID | Screen | Who sees it | Event status | Entry/catch state | Data shown | Actions available | Actions NOT shown and why | Rule / test IDs | Source |
|---|---|---|---|---|---|---|---|---|---|
| JDG-00a | Judging | J, S (anyone who is `events.judge` or `events.backup_judge` of a live or closed tournament) | live, closed | Pending catches the viewer may judge | One section per tournament where the viewer is judge or backup judge, live or closed, stacked: `name`, role (Judge or Backup judge), pending count, its three oldest pending catches (as JDG-01a). Refreshes when opened and on focus (Gap 25) | Open a tournament's queue (→ JDG-01a, or JDG-01b for the backup judge) | Drafts and final tournaments; catches outside the viewer's scope (R-CAT-U-08, U-09) | R-CAT-L-05, L-06, R-EVT-L-02, L-03 | DEC 2026-10-05 "The Judge tab opens a Judging home" |
| JDG-00b | Judging: nothing pending | J, S | live, closed | No pending catch in any section | The same sections, each "0 pending · Nothing to judge" | Open a tournament's queue (its Verified and Rejected filters) | — | R-CAT-L-05, L-06 | DEC 2026-10-05 "The Judge tab opens a Judging home" |
| JDG-01a | Judge queue | J | live, closed | Catches on other anglers' entries, including withdrawn entries | Per catch: `display_name`, `species`, measurement [W] or [L], photo count, `status`, `flags` codes (`no_capture_time`, `before_window`, `after_window`, `late_submit`, `photo_added`, `extra_photo_no_time`, `extra_photo_far`), hours from `captured_at` to `created`, `created`, entry withdrawn marker. Per tournament, filter Pending (default, oldest first by `created`); Verified and Rejected filters in JDG-01f and JDG-01g. Updates live (Gap 25) | Open (→ JDG-02); switch filter (→ JDG-01f, JDG-01g) | J's own catches as actionable (R-CAT-U-06) | R-CAT-L-05, L-08, R-CAT-C-20 | SPEC Must 3; FEAT S3 steps 1, 2, 11; SCO §3, §5 |
| JDG-01b | Judge queue (backup) | S | live, closed | Catches where `entry.angler = events.judge` | Same fields, including the judge's `display_name` even if the judge has withdrawn as an angler, with an entry withdrawn marker | Open (→ JDG-02) | Anyone else's catches (R-CAT-U-08); another tournament's catches (R-CAT-U-09) | R-CAT-L-06, R-CAT-U-07, R-ENT-L-06 | SCO §7, examples 12, 18 |
| JDG-01f | Judge queue: Verified filter | J (S: the judge's catches) | live, closed | `verified` | Same fields + decided time and "Corrected" where a `correct` row exists; most recently decided first | Open (→ JDG-02d) | — | R-CAT-L-05, L-06 | DEC 2026-10-03 "Judge queue filters" |
| JDG-01g | Judge queue: Rejected filter | J (S: the judge's catches) | live, closed | `rejected` | Same fields + `reason`; most recently decided first | Open (→ JDG-02d) | — | R-CAT-L-05, L-06 | DEC 2026-10-03 "Judge queue filters" |
| JDG-01c | Judge queue: empty | J, S | live, closed | Nothing pending | "Nothing pending"; the Pending, Verified and Rejected filters stay visible; "Decided catches are under Verified and Rejected" | Switch filter (→ JDG-01f, JDG-01g) | — | R-CAT-L-05, L-06 | FEAT S3 |
| JDG-01d | Judge queue: final | J, S | final | — | No queue; catches read only | — | Any judging (R-CAT-U-12) | R-CAT-U-12 | SPEC invariant 7 |
| JDG-01e | Judge queue: organizer not judge | K, when not J or S of this event | live, closed | — | No queue | — | Judging (the update rule keys on `events.judge` and `events.backup_judge`, not the organizer role) | R-CAT-U-46 | SEC catches |
| JDG-02a | Review catch: pending | J; S on the judge's catches | live, closed | `pending` | Every photo, the first two labelled "Holding the fish" and "On the scale" / "On the board", each with its entry in `photo_captured_at`; `species`; measurement [W] or [L]; `captured_at`; `created`; hours capture → receipt; `flags` codes; `starts_at`, `ends_at`; `code_word` when on (to find in either required photo); `display_name`; entry withdrawn marker; the catch timeline (as LB-03). `rev` held for the request | Approve; Reject (→ JDG-03); Correct (→ JDG-04; approves at the corrected value) | Set `pending` or any other status (R-CAT-U-14); correct and reject together (R-CAT-U-41); send `photo` or `photo_captured_at` (R-CAT-U-33, U-37); set `judged_by`, `flags`, `entry`, `captured_at`, `client_uuid` (R-CAT-U-15) | R-CAT-U-01, U-02, U-04, U-07, U-38, R-AUD-L-04, L-05 | SPEC Must 3; SCO §7 |
| JDG-02b | Review catch: changed since loaded | J, S | live, closed | Angler edited after the judge loaded it (`rev` moved) | "This catch changed"; reloaded with the new values | Review again | Repeating the old decision | R-CAT-U-13 | SCO §7; ARCH §3 "Why `rev`" |
| JDG-02c | Review catch: retracted since loaded | J, S | live, closed | `retracted` | Reloaded; "Retracted" | — | Any decision (R-CAT-U-31) | R-CAT-U-31 | SEC catches "Retract, not delete" |
| JDG-02d | Review catch: decided | J; S on the judge's catches | live, closed | `verified` or `rejected` | As JDG-02a + current decision, `reason`, decided by | Re-judge (→ JDG-05); Correct (→ JDG-04; on a rejected catch this re-approves it) | Changing the decision without a reason (R-CAT-U-42) | R-CAT-U-11, U-04, U-42, U-44 | DEC "The judge can change a decision" |
| JDG-02e | Review catch: retracted | J; S on the judge's catches | live, closed | `retracted` | Read only | — | Approve, reject, correct (R-CAT-U-31) | R-CAT-L-05 | SCO §6 |
| JDG-02f | Review catch: own catch | J (S on S's own catch) | live, closed | The viewer is the angler | Read only; "Judged by the backup judge" (for J) | — | Any decision (R-CAT-U-06) | R-CAT-U-06 | SCO example 12 |
| JDG-02g | Review catch: outside backup scope | S | live, closed | A catch by anyone other than the judge | As any member sees it | — | Any decision (R-CAT-U-08, U-09) | R-CAT-L-06 | SCO §7 |
| JDG-02h | Review catch: final | J, S, K | final | any | Read only; "Photo archived" | — | Any decision (R-CAT-U-12) | R-CAT-U-12 | SPEC invariant 7 |
| JDG-02i | Review catch: code word changed | J; S on the judge's catches | live, closed | `pending`; `code_word_on`; the word changed within 24 h of photo 1, or photo 1 has no capture time | As JDG-02a, with both words from the event: `code_word_prev` (in effect before the change) and `code_word` (current), and `code_word_changed_at` | Approve; Reject (→ JDG-03); Correct (→ JDG-04) | — | R-EVT-U-27, R-EVT-C-10 | DEC 2026-10-03 "Which code word a catch must show"; DEC 2026-10-05 "Code word history is stored on the event" |
| JDG-02j | Review catch: NOT SENT | J; S on the judge's catches | live, closed | No server reply to Approve | "NOT SENT"; the decision as chosen | Retry: reloads the catch first; if it already shows the decision (`status` and `judged_by` = the viewer), says it was saved and sends nothing; if `rev` moved, → JDG-02b; otherwise resends | Repeating the decision blind | R-CAT-U-01, U-13 | DEC 2026-10-05 "No reply on any change" |
| JDG-03a | Reject | J; S on the judge's catches | live, closed | `pending` | Catch summary; reason (required, free text) | Reject (sends `rev`) | Reject with an empty reason (R-CAT-U-03) | R-CAT-U-02, U-03, R-AUD-H-01 | SCO §7, examples 14, 17 |
| JDG-03b | Reject: NOT SENT | J; S on the judge's catches | live, closed | No server reply | "NOT SENT"; the reason kept, locked | Retry, as JDG-02j | — | R-CAT-U-02, U-13 | DEC 2026-10-05 "No reply on any change" |
| JDG-04a | Correct | J; S on the judge's catches | live, closed | `pending`, `verified` or `rejected` | Current `species`, measurement and `status`; new `species` (this event's list) and/or measurement (same inputs as SUB-01); reason (required); "Saving approves this catch at the corrected value" | Save correction (sends `rev`): sets `verified`, one `correct` row | Save without a reason (R-CAT-U-05); reject in the same step (R-CAT-U-41); a species outside the list (update rule species check) | R-CAT-U-04, U-05, U-41, U-44, R-AUD-H-01 | SCO v0.5 §7, examples 15, 21; DEC "Correct is one action" |
| JDG-04b | Correct: NOT SENT | J; S on the judge's catches | live, closed | No server reply | "NOT SENT"; the correction and reason kept, locked | Retry, as JDG-02j (saved when the catch shows the corrected value and `verified`) | — | R-CAT-U-04, U-13 | DEC 2026-10-05 "No reply on any change" |
| JDG-05a | Re-judge: verified → rejected | J; S on the judge's catches | live, closed | `verified` | Current decision and value; reason (required) | Change to rejected (sends `rev`) | Changing without a reason (R-CAT-U-42) | R-CAT-U-11, U-42 | SPEC Must 3; DEC re-judge, "A reason is required for any change to a decision" |
| JDG-05b | Re-judge: rejected → verified | J; S on the judge's catches | live, closed | `rejected` | Current decision and rejection `reason`; reason for the change (required) | Change to verified (sends `rev`) | Changing without a reason (R-CAT-U-42) | R-CAT-U-42, U-43 | SCO §7, example 26 (v0.5); DEC "A reason is required for any change to a decision" |
| JDG-05c | Re-judge: NOT SENT | J; S on the judge's catches | live, closed | No server reply | "NOT SENT"; the change and reason kept, locked | Retry, as JDG-02j (saved when `status` already shows the new decision) | — | R-CAT-U-11, U-43 | DEC 2026-10-05 "No reply on any change" |

### 2.7 Organizer

| ID | Screen | Who sees it | Event status | Entry/catch state | Data shown | Actions available | Actions NOT shown and why | Rule / test IDs | Source |
|---|---|---|---|---|---|---|---|---|---|
| ORG-01a | Manage tournament: draft | K | draft | — | Every `events` field; `judge` and `backup_judge` by `users.name`; `submit_deadline` (computed, read only); the Open checklist: `starts_at` before `ends_at`, ≥ 1 species, judge and a different backup judge, `code_word` set when `code_word_on` (Gap 11, settled 2026-10-05) | Edit (→ ORG-02); Open (draft → live), with a confirmation sheet, offered only when every checklist item is met | Close or finalize (skips a step: R-EVT-U-09); Extend (R-EVT-U-14); Delete (R-EVT-D-01) | R-EVT-U-01, U-06, U-25, R-AUD-H-03 | SPEC Must 4; FEAT S4 steps 1, 4; DEC 2026-10-05 |
| ORG-01b | Manage tournament: live | K | live:open | — | + entry count, pending count (both update live: Gap 25), `deadline_ext_min`, `submit_deadline` | Edit live fields (→ ORG-03); Extend deadline (→ ORG-04); Entries (→ ORG-08) | Close before `submit_deadline` (R-EVT-U-07); finalize (R-EVT-U-09); back to draft (R-EVT-U-10) | R-EVT-U-04, U-12 | OPS §9 |
| ORG-01c | Manage tournament: past deadline | K | live:over | — | Same | Close (→ ORG-05); Extend deadline (→ ORG-04; this reopens joining and submissions); Edit live fields; Entries | Finalize (R-EVT-U-09) | R-EVT-U-07, U-12, U-26 | OPS §9 "Close and finalize" |
| ORG-01d | Manage tournament: closed | K | closed | — | + pending count, split into pending for J and pending for S (the judge's own); an unhashed preview of each CSV, marked "Preview, not final" (Gap 15, settled) | Finalize (→ ORG-06); change the backup judge (→ ORG-03b); preview and download each CSV; Entries | Extend (R-EVT-U-14); reopen (R-EVT-U-10); change `ends_at` (hook refuses once closed); a hash on a preview | R-EVT-U-08, U-14, U-10 | ARCH §4b; OPS §9; DEC 2026-10-05 |
| ORG-01e | Manage tournament: final | K | final | — | Read only | Exports (→ ORG-07); Entries (read only) | Any change (R-EVT-U-05) | R-EVT-U-05 | SPEC invariant 7 |
| ORG-02a | New tournament | K | (new) → draft | — | `name`, `starts_at`, `ends_at` (club time, labelled Eastern), `metric` (weight by default), `best_n` (10), `species` (multi, from `species`), `judge` (organizers only), `backup_judge` (from all `users`, except the judge), `code_word_on` (off), `code_word`. "Saving enters the judge and backup judge in this tournament." `submit_deadline` shown after save. A draft can be saved incomplete (Gap 11) | Save as draft; Add a species (→ ORG-10) | A status other than draft (R-EVT-C-03); `submit_deadline` (R-EVT-C-04); `deadline_ext_min` (R-EVT-C-06); a judge without the organizer role (R-EVT-C-07) | R-EVT-C-01, C-07, C-08, C-09, R-USR-L-03, R-SPC-L-03 | SCO v0.5 §1, §2, §3, §5, §7; FEAT S4 step 1; DEC "Judge must be an organizer" |
| ORG-02b | Edit draft | K | draft | — | Same, every field editable. Changing `judge` or `backup_judge` enters the new person if they have no entry; the previous person's entry stays (withdraw it on ORG-08 if they aren't fishing; entries in a draft only appear there once the event is live) | Save | A judge without the organizer role (R-EVT-U-16) | R-EVT-U-01, U-16, U-17 | FEAT S4 step 1; DEC "Judge must be an organizer" |
| ORG-02c | New or edit draft: judge = backup judge | K | draft | — | Which fields clash | Fix and save | Saving as is | R-EVT-C-05, U-11 | SEC events |
| ORG-03a | Edit live tournament | K | live | — | Editable: `name`; `code_word_on` and `code_word`; `backup_judge` (a new backup judge is entered automatically if they have no entry); `ends_at`, later only and only while the window is open (recomputes `submit_deadline`; audited). Read only, with the reason shown: `judge` (changed only by the superuser step-down), `metric`, `best_n`, `species`, `starts_at` (Gaps 9 and 10, settled 2026-10-05) | Save | Locked fields (R-EVT-U-03); `judge` = `backup_judge` (R-EVT-U-11); a judge without the organizer role (R-EVT-U-16); an earlier `ends_at`, or any `ends_at` change once the window has closed | R-EVT-U-04, U-03, U-11, U-16, U-17, U-18, U-20 to U-22, U-27, R-AUD-H-03 | FEAT S4 step 3; DEC 2026-10-03, 2026-10-05 |
| ORG-03b | Edit closed tournament | K | closed | — | Editable: `backup_judge` only; every other field read only (Gap 9, settled 2026-10-05) | Save backup judge | Any other field (closed-event branch of the update rule); `ends_at` (events hook) | R-EVT-U-23, U-24 | SEC events; DEC 2026-10-05 |
| ORG-04a | Extend final deadline | K | live (any phase) | — | `ends_at` (doesn't move); current `deadline_ext_min`; current and resulting `submit_deadline`; "Outage length from the outage log, rounded up to whole hours". Input: the **new total** extension in whole hours, stored as minutes. Members then see "extended by n h after an outage" (Gap 28) | Set a higher total | A total lower than the current one (R-EVT-U-13); part hours (R-EVT-U-15); set it on a draft or closed event (R-EVT-U-14) | R-EVT-U-12, U-13, U-15, R-AUD-H-03 | SCO §6, example 23; OPS §9, §10; DEC outage rule |
| ORG-04b | Extend: refused | K | live, or closed since loaded | — | Reloaded `deadline_ext_min` and `status`, with the reason inferred (Gap 16) | Back (→ ORG-01) | Saving again unchanged | R-EVT-U-13, U-14, U-15 | SEC events hook |
| ORG-04c | Extend: NOT SENT | K | live | No server reply | "NOT SENT"; the new total kept | Retry: reloads the event first; if `deadline_ext_min` already equals the new total, says it was saved; otherwise resends (a total is safe to repeat: DEC 2026-10-01 "Outage extension input") | — | R-EVT-U-12 | DEC 2026-10-05 "No reply on any change" |
| ORG-05a | Close | K | live:over | — | `submit_deadline` (passed); pending count; what closing does: no more joining, submissions or angler edits; judging continues | Confirm close | — | R-EVT-U-07 (refused only before `submit_deadline`), R-AUD-H-03 | SPEC Must 4; OPS §9 |
| ORG-05b | Close: refused | K | live, before `submit_deadline` (extension raised, or a phone clock ahead of the server) | — | Reloaded `submit_deadline` and the extension, with the reason inferred (Gaps 16, 17) | Back (→ ORG-01) | Close | R-EVT-U-07 | SEC events hook |
| ORG-05c | Close: NOT SENT | K | live:over | No server reply | "NOT SENT" | Retry: reloads the event first; if `status` is already `closed`, says so; otherwise resends | — | R-EVT-U-07 | DEC 2026-10-05 "No reply on any change" |
| ORG-06a | Finalize | K | closed | 0 pending | "This can't be undone": catches, entries and the event lock; board names freeze; photos show "Photo archived"; next steps are exports, backup, archive. An "I've checked the standings" switch enables the button | Confirm finalize | — | R-EVT-U-08, R-AUD-H-03 | SPEC Must 4, invariant 7; OPS §9 |
| ORG-06b | Finalize: blocked | K | closed | ≥ 1 pending (retracted don't count) | Pending count: for J, and for S (the judge's own catches) | Open the judge queue (→ JDG-01) | Finalize (R-EVT-U-08) | R-EVT-U-08 | ARCH §4b; SCO example 20 |
| ORG-06c | Finalize: NOT SENT | K | closed | No server reply | "NOT SENT" | Retry: reloads the event first; if `status` is already `final`, says so and goes to Exports (→ ORG-07); otherwise resends | — | R-EVT-U-08 | DEC 2026-10-05 "No reply on any change" |
| ORG-07a | Exports | K | final | — | Results CSV built in the browser by `web/src/lib/scoring.ts`; audit CSV of every `audit_log` row for this `event`; the SHA-256 of each (shown in 8 groups of 8 characters, copied as one string), to post with the standings in the group chat. Format (Gap 15, settled 2026-10-05): UTF-8 without BOM, LF, header row, UTC ISO 8601 timestamps, raw integers plus readable columns in a fixed unit (never `display_units`), fixed sort; exact column names set in the S4 build | Build the results CSV; build the audit CSV; share each file with its hash (iPhone share sheet, where the browser can share files: DEC 2026-10-05); download each; copy each hash | A hash on the closed-event preview (ORG-01d) | R-CAT-L-08, R-ENT-L-05, R-AUD-L-04 (the reads); FEAT S4 step 7 | SPEC Must 4; DEC 2026-09-30 finalize, 2026-10-05 CSV format |
| ORG-08a | Entries | K | live, closed | — | Every entry, including withdrawn: `display_name`, `created`, `withdrawn`, `withdraw_reason`, `withdrawn_by` (name from `users`) | Withdraw an angler (→ ORG-09); Reinstate a withdrawn angler (→ ORG-09) | Add someone else (R-ENT-C-02); delete (R-ENT-D-01) | R-ENT-L-05, U-07, U-09, U-14, R-USR-L-03 | SPEC roles; DEC withdrawn flag; OPS §9 |
| ORG-08b | Entries: own entry | K | live, closed | K's own entry | K's row | Withdraw self, no reason needed | — | R-ENT-U-13 | SEC entries update rule |
| ORG-08d | Entries: final | K | final | — | Read only | — | Any change (R-ENT-U-10) | R-ENT-U-10 | SPEC invariant 7 |
| ORG-09a | Withdraw an angler | K | live, closed | Target active, not K | `display_name`; reason (required) | Withdraw | Withdraw with an empty reason (R-ENT-U-08) | R-ENT-U-07, U-08, R-AUD-H-02 | SCO §3; DEC withdrawn flag |
| ORG-09b | Reinstate an angler | K | live, closed | Target withdrawn (by anyone) | `display_name`, `withdraw_reason`, `withdrawn_by` | Reinstate | — | R-ENT-U-09, R-AUD-H-02 | SCO §3, example 19 |
| ORG-09c | Withdraw or reinstate: NOT SENT | K | live, closed | No server reply | "NOT SENT"; the reason kept | Retry: reloads the entry first; if `withdrawn` already matches, says it was saved; otherwise resends | — | R-ENT-U-07, U-09 | DEC 2026-10-05 "No reply on any change" |
| ORG-10a | Species | K | — | — | Every `species.name` | Add a species | Rename (R-SPC-U-01); delete (R-SPC-D-01) | R-SPC-L-03, C-01 | SPEC roles; DEC "Ineligible species are blocked" |
| ORG-10b | Species: duplicate | K | — | — | "That species already exists" | Fix the name | Saving as is | R-SPC-C-03 | SEC species |

### 2.8 Profile and system states

| ID | Screen | Who sees it | Event status | Entry/catch state | Data shown | Actions available | Actions NOT shown and why | Rule / test IDs | Source |
|---|---|---|---|---|---|---|---|---|---|
| PRF-01a | Profile | M, J, S, K | — | — | `name`, `display_units` (lb or lb_oz), `email` (read only). [W] everywhere follows this setting | Change name; change display units; sign out | Change `email` or `verified` (R-USR-U-03); change `role` (R-USR-U-02); delete account (R-USR-D-01) | R-USR-V-02, U-01 | SPEC roles; SCO §4; DEC 2026-10-03 (sign-out on Profile) |
| PRF-01b | Profile: name changed | M, J, S, K | live, closed vs final | — | "Your board name updates in live and closed tournaments; final results keep the name they were published with" | — | — | R-USR-U-06 | SCO §9; DEC name sync |
| SYS-01a | Offline | M, J, S, K | any | — | "No connection"; data on screen is the last loaded; submissions go to SUB-02c; leaderboard to LB-01b or c | Retry where the screen offers it | — | FEAT S1 step 13, S2 step 10 (no test ID) | ARCH §4 |
| SYS-02a | Not found / not allowed | M, J, S | — | A draft event, another angler's rejected or retracted catch, a catch on someone else's withdrawn entry, or a JDG or ORG screen without the role | "Not available" (the API returns the record as absent) | Back | — | R-EVT-V-01, R-CAT-V-01, R-ALL-V-01, R-EVT-U-02, R-CAT-U-10 | SEC conventions "What Deny means" |
| SYS-03a | Locked | M, J, S, K | final | — | "This tournament is final; nothing can change" after a refused change; the screen reloads read only | Reload | Any change (R-CAT-U-12, R-ENT-U-10, R-EVT-U-05) | R-CAT-U-12, R-ENT-U-10, R-EVT-U-05 | SPEC invariant 7 |
| SYS-04a | Session ended | M, J, S, K | any | PocketBase auth no longer valid | "Please sign in again"; your catches are safe, an unsent photo is still in the camera roll. A valid token is refreshed each time the app opens (14-day lifetime), so this shows only after two weeks away or a revoked session. After repeated network failures the app does a full page reload so an expired Access session can prompt (Gap 19) | Sign in (→ AUTH-01) | — | R-USR-A-01; invariant 8 | SPEC invariant 8; DEC L1; DEC 2026-10-05 |
| RULES-01a | Club rules | M, J, S, K | any | — | Read only, worded from the `scoring.md` version in force (version and date shown): what counts (SCO §2); proof photos and the code word (§5); submitting, the 24-hour rule, the final deadline, editing, retracting and outages (§6); photo limits (`image/jpeg`, 5 MB per file, 4 per catch; capture time kept, location removed). Opened from a tournament page, a "This tournament" section adds that tournament's species, metric, fishing window, final deadline (with the extension note when extended) and whether the code word is on; opened from home, club-wide rules only (Gap 37, settled 2026-10-07) | Back | — | none (static content; the tournament section reads the event, R-EVT-L-02) | DEC 2026-10-05 "Club rules screen"; DEC 2026-10-07 "Club rules also shows the open tournament's values"; SCO §2, §5, §6; DEC 2026-10-01 "Photo field limits" |

---

## 3. Navigation map

Indented items lead from the item above them. Conditions in brackets.

**Everyone**
- Cloudflare Access login (AUTH-00, out of scope)
  - AUTH-01 Sign in: email → AUTH-02 Sign in: code → LB-01 Leaderboard of the live tournament the member has an active entry in; with two or more, EVT-01d; otherwise EVT-01 Home. Sign-out on PRF-01
- From any signed-in screen: PRF-01 Profile; SYS-01 to SYS-04 as states
- From EVT-01 and EVT-02: RULES-01a Club rules

**Member (M)**
- EVT-01 Tournaments
  - EVT-02 Tournament
    - Join [live:open, not joined] → stays on EVT-02 (now active); EVT-02n first if the member's name is empty
    - EVT-03 Withdraw [active, not final] → EVT-02 (withdrawn)
    - Rejoin [withdrawn-self, live:open] → EVT-02 (active)
    - SUB-01 Submit [active, live:window or live:late] → SUB-02 Submission status → MY-02
    - MY-01 My catches → MY-02 My catch
      - MY-03 Edit [pending, editable]
      - MY-04 Add photos [pending, editable, < 4 photos]
      - MY-05 Retract [pending, editable]
      - MY-06 Catch history
      - SUB-01 Submit a new catch [rejected, and submitting is open]
    - LB-01 Leaderboard → LB-02 Angler's catches → LB-03 Catch detail

**Judge (J), in addition**
- Judge tab → JDG-00a Judging → JDG-01 Judge queue of the chosen tournament
- EVT-02 → JDG-01 Judge queue [live or closed] → JDG-02 Review catch
  - JDG-03 Reject; JDG-04 Correct; JDG-05 Re-judge
  - Stale `rev` → JDG-02b, then back to JDG-02a or JDG-02d

**Backup judge (S), in addition**
- EVT-02 → JDG-01 (the judge's catches only) → JDG-02 → JDG-03, JDG-04, JDG-05

**Organizer (K), in addition**
- EVT-01 → ORG-02 New tournament; ORG-10 Species
- EVT-02 → ORG-01 Manage tournament; ORG-08 Entries
  - ORG-02 Edit draft [draft]; Open [draft, checklist met] → confirmation sheet
  - ORG-03 Edit live tournament [live]; ORG-03b [closed: backup judge only]
  - ORG-04 Extend final deadline [live]
  - ORG-05 Close [live:over]
  - ORG-06 Finalize [closed] → (blocked) JDG-01
  - ORG-07 Exports [final]
  - ORG-08 Entries → ORG-09 Withdraw or reinstate

### 3.1 What changes when roles combine

| Combination | What changes |
|---|---|
| K = organizer + judge (E1, E2) + angler | Sees every menu. K is entered in every tournament K judges when it is created (R-EVT-C-08), so K never taps Join there. K's own catches appear in MY-* and in S's JDG-01b, and are read only for K (JDG-02f, R-CAT-U-06). K's leaderboard matches everyone's even though K can read rejected, retracted and withdrawn rows (scoring module filters, LB-01a; same angler pages too, Gap 21). K withdraws their own entry without a reason (ORG-08b). K's Finalize is blocked by K's own pending catches until S clears them (ORG-06b). |
| S = member + backup judge (E1) + angler | In E1, S was entered when E1 was created; EVT-02l and JDG-01b appear, for K's catches only. S's own catches are judged by K. S can't withdraw anyone (R-ENT-U-12). In E2 and every other event S is an ordinary member (R-ALL-S-01). |
| N = backup judge in E2 only | Mirror of S, in E2 only (R-CAT-U-09). |
| Organizer who isn't this event's judge | ORG screens, no JDG screens (JDG-01e). |
| Judge who isn't the organizer | Not allowed: the judge picker lists organizers only, and the rules and hooks refuse anyone else (R-EVT-C-07, U-16). The one exception is a judge step-down (next rows). |
| Judge who withdraws from their own tournament | Withdrawing removes only the judge's angler entry from the board; they stay the judge, and keep closing and finalizing. S still judges the judge's pending catches and sees the judge's name on them (R-ENT-L-06). |
| Judge who has to step down | No screen: a logged superuser step (DEC 2026-10-05 "Judge step-down details"). The backup judge becomes J (organizer role not required) and a new S is named. From then on the new J sees JDG-01a for everyone else's catches, the new S sees JDG-01b for the new J's, and the former judge is an ordinary angler (and still K for close and finalize). The tournament page names the new J and S from their entries. `scoring.md` v0.6, in force 2026-10-05. |
| Any judge as an angler | Uses every M screen like anyone else (R-CAT-C-18, R-ENT-C-08). |

### 3.2 Where units appear

| Screen | Weight [W] | Length [L] |
|---|---|---|
| SUB-01, MY-03 (entry) | Both formats offered, regardless of `display_units` | Inches and quarter-inches, rounded down |
| JDG-04 (judge entry) | Same as SUB-01 | Same as SUB-01 |
| SUB-02, MY-01, MY-02, LB-01, LB-02, LB-03, JDG-01, JDG-02, JDG-03, JDG-05 (display) | Viewer's `display_units` | Inches and quarter-inches |
| MY-06, LB-03, JDG-02 (timeline: changed fields from the `before` / `after` snapshots) | Viewer's `display_units` | Inches and quarter-inches |
| ORG-07 (CSV) | Raw `weight_hoz` plus decimal pounds to 0.01 lb; never `display_units` (Gap 15) | Raw `length_q` plus inches to 0.25 in (Gap 15) |
| PRF-01 | Where `display_units` is set | n/a |

---

## 4. State coverage checklist

| Required state | Covered by |
|---|---|
| Sign-in by OTP | AUTH-01a, AUTH-02a |
| Wrong or expired code | AUTH-02b, AUTH-02c |
| Joining | EVT-02a (allowed), EVT-02n (name needed first), EVT-02b (refused after deadline or not live) |
| Withdrawing | EVT-02c to g, EVT-03a, EVT-03b |
| Rejoining | EVT-02h (allowed), EVT-02i (closed), EVT-02j (withdrawn by organizer) |
| A withdrawn member's view | EVT-02h to j, MY-02d, LB-01e |
| Organizer withdraw-with-reason and reinstate | ORG-08a, ORG-09a, ORG-09b |
| Submit: species limited to the event's list | SUB-01a |
| Submit: weight or length per metric | SUB-01a, SUB-01b |
| Submit: two required photos (holding the fish; on the scale or board) plus up to 2 more | SUB-01a, SUB-01b, SUB-01d |
| Sending / Received / NOT SENT + Retry | SUB-02a, SUB-02b, SUB-02c |
| Double submit (same `client_uuid`) | SUB-02d |
| Submitting outside the window or after `submit_deadline` | SUB-01c (after `ends_at`, before deadline), SUB-01e, SUB-02e |
| Pending: edit species and measurement | MY-02a, MY-03a, MY-03b |
| Pending: add photos, append-only | MY-02a, MY-02b, MY-04a to c |
| Pending: retract | MY-05a, MY-05b |
| Once judged or past the deadline | MY-02c, MY-02e to h, MY-03b, MY-05b |
| Angler's view: verified, rejected with reason, retracted, corrected | MY-02e, MY-02g, MY-02h, MY-02f |
| Angler's own audit trail | MY-06a |
| Catch timeline for other members (decided 2026-10-01) | LB-03a, LB-03b |
| Judge queue with each flag | JDG-01a, JDG-02a |
| Hours from capture to receipt | JDG-01a, JDG-02a |
| Approve / reject with required reason / correct | JDG-02a, JDG-03a, JDG-04a |
| Stale-`rev` refusal and reload | JDG-02b, JDG-02c |
| Re-judge with reason | JDG-02d, JDG-05a, JDG-05b |
| No self-approval | JDG-01a, JDG-02f |
| Backup judge limited to the judge's catches | JDG-01b, JDG-02g |
| Leaderboard: total, counted fish, biggest fish, pending count | LB-01a |
| Shared places | LB-01a |
| Withdrawn entries left out | LB-01a, LB-01e |
| Live / Reconnecting / "updated hh:mm" | LB-01a, LB-01b, LB-01c |
| Organizer: create and edit a draft | ORG-02a to c |
| Open | ORG-01a |
| Live-edit limits | ORG-03a, ORG-03b |
| Outage extension (`deadline_ext_min`) | ORG-04a, ORG-04b |
| Close (refused before `submit_deadline`) | ORG-01b, ORG-05a, ORG-05b |
| Finalize (refused while anything is pending) | ORG-06a, ORG-06b |
| Results and audit CSV with SHA-256 | ORG-07a (preview while closed: ORG-01d) |
| Add a species | ORG-10a, ORG-10b |
| Profile: own name and display units | PRF-01a, PRF-01b |
| Empty: no events | EVT-01c |
| Empty: nothing submitted | MY-01a, LB-01d |
| Empty: empty queue | JDG-01c |
| Error: offline | SYS-01a, SUB-02c, MY-04b, LB-01b |
| Error: permission refused | SYS-02a |
| Error: event final / locked | SYS-03a, JDG-01d, JDG-02h, ORG-01e |
| No reply on any change | SUB-02c, MY-03c, MY-04b, MY-05c, JDG-02j, JDG-03b, JDG-04b, JDG-05c, ORG-04c, ORG-05c, ORG-06c, ORG-09c |
| Judging across tournaments | JDG-00a, JDG-00b |
| Club rules | RULES-01a |

---

## 5. Gaps and conflicts

Each item: the question, the screens affected, and options. No answer is chosen here unless it says **Settled**, with the decision it points to.

**1. Settled 2026-10-01: `reason` stays one field and is public on visible catches.**
`decisions.md` "Catch history is public to members": every member reads the full history of any catch they can see, including an overturned rejection and its reason, corrections and the angler's own edits. Catches that are rejected or retracted now stay hidden. Rule and tests: `security.md` v0.5 `audit_log` list rule, R-AUD-L-02, L-06, L-07.
Screens: LB-03a, MY-02e, MY-06a, JDG-02a.

**2. Settled 2026-10-02: a reason is required for any change to a decision already made.**
`decisions.md` "A reason is required for any change to a decision already made": verified → rejected, rejected → verified, and every correction. Rule and tests: `security.md` v0.6 judge branch, R-CAT-U-42, U-43.
Screens: JDG-02d, JDG-05a, JDG-05b, LB-03a.

**3. Settled 2026-10-02: Correct is one action and always leaves the catch verified.**
`decisions.md` "Correct is one action": one request, one `correct` row; correcting a pending catch approves it, a verified one stays verified, a rejected one is re-approved; correct and reject can't be combined. Tests: R-CAT-U-04, U-41, U-44. Written into the `scoring.md` v0.5 draft (§7, example 15).
Screens: JDG-02a, JDG-02d, JDG-04a, MY-02f, LB-03a.

**4. Settled 2026-10-01: `flags` is an array of fixed codes.**
`decisions.md` "`flags` is a JSON array of fixed codes": `no_capture_time`, `before_window`, `after_window`, `late_submit`, `photo_added`, plus `extra_photo_no_time` and `extra_photo_far` (renamed 2026-10-02 from `added_photo_*`, see Gap 35), added by the hook and never removed. Tests: R-CAT-C-20, C-22, U-34, U-35, U-38.
Screens: JDG-01a, JDG-02a.

**5. Settled 2026-10-01: photo limits.**
`decisions.md` "Photo field limits": `image/jpeg` only, 5 MB per file, the browser resizes to a 2560 px long edge at about 85% quality. The photo spike can still add an error case for browsers that can't decode HEIC. Tests: R-CAT-C-16, U-27.
Screens: SUB-01a, SUB-01d, MY-04a, MY-04c.

**6. Settled 2026-10-01: capture time per photo.**
`decisions.md` "Capture time per photo": `captured_at` is the first photo's time; the new `photo_captured_at` holds one time per photo. Any photo after the first with no time, or one more than 24 h from `captured_at`, is flagged, never refused (at submit too, since Gap 35 was settled). Tests: R-CAT-C-19, C-22, U-34 to U-37.
Screens: SUB-01a, MY-04a, JDG-02a.

**7. Settled 2026-10-01: outage extension input.**
`decisions.md` "Outage extension input": the field stays `deadline_ext_min`; the organizer enters the new total in whole hours; the hook refuses a lower total or part hours. Tests: R-EVT-U-12, U-13, U-15.
Screens: ORG-04a, ORG-04b.

**8. Settled 2026-10-02: the judge must be an organizer, and the judge and backup judge are entered automatically.**
`decisions.md` "Judge must be an organizer; judge and backup judge are entered automatically". The judge is chosen when the event is created; the picker lists organizers only, and the events create rule and hooks refuse anyone else. The judge and backup judge get entries (with `join` rows) when the event is created; a later change of judge or backup judge enters the new person, and the previous person's entry stays. Tests: R-EVT-C-07 to C-09, U-16, U-17, R-ENT-C-08. Written into the `scoring.md` v0.5 draft §3 and §7.
Screens: EVT-02a, EVT-02l, ORG-02a, ORG-02b, ORG-03a.

**9. Settled 2026-10-05: live and closed event edits** (`decisions.md` "Live and closed event edits, the rest"; earlier parts 2026-10-03 and 2026-10-05). While live: `name`, the code word (`code_word_on`, `code_word`), `backup_judge` and `ends_at` (later only, Gap 10) can change; `judge` (superuser step-down only), `metric`, `best_n`, `species` and `starts_at` are locked. Once closed: only `backup_judge`. **Needs in `security.md`:** a closed-event branch in the events update rule with tests; a backup judge named after close gets no entry (DEC 2026-10-05).
**Earlier note (2026-10-03):** the code word can change while live, and a catch must show the word in effect when its first photo was taken (both words shown to the judge if the capture time is missing or the word changed within 24 hours: DEC "Which code word a catch must show"); the judge can only step down, as a logged superuser step (DEC 2026-10-05; needs `scoring.md` v0.6 and `security.md` changes).
Screens: ORG-03a, ORG-03b, ORG-01d, SUB-01a, JDG-02a.

**10. Settled 2026-10-05: `ends_at` moves later only, while the window is open** (`decisions.md` "Moving `ends_at` while live", option b). The hook refuses an earlier time, or any change once the window has closed. **Needs in `security.md`:** the hook check and tests.
**Original question:** Limits on moving `ends_at` while live (could it move earlier than now, or before `starts_at`, leaving old flags wrong?).
Screens: ORG-03a, JDG-01a.

**11. Settled 2026-10-05: Open is refused by the hook unless the draft is complete** (`decisions.md` "What a draft needs before Open", option a): `starts_at` before `ends_at`, ≥ 1 species, a judge and a different backup judge, and a code word when `code_word_on`. A draft can be saved incomplete. The manage screen shows the same list as a checklist. **Needs in `security.md`:** the hook check and a test per condition.
**Original question:** draft validation and preconditions for Open; without a backup judge, the organizer's own catches can't be judged and Finalize stays blocked.
Screens: ORG-01a, ORG-02a, ORG-02b.

**12. Settled 2026-10-02: the backup judge sees the judge's withdrawn entry.**
`decisions.md` "Backup judge sees the judge's withdrawn entry": one new branch in the `entries` list rule (`event.backup_judge = @request.auth.id && angler = event.judge`). Withdrawing removes only the judge's angler entry; they stay the judge. Test: R-ENT-L-06. A judge handover (the backup judge becoming head judge) is not in the MVP: `decisions.md` "No judge handover in the MVP" (since replaced by the 2026-10-03 and 2026-10-05 step-down rows).
Screens: JDG-01b, JDG-02a.

**13. Settled 2026-10-03: judge names come from their entries** (`decisions.md` "Judge names come from their entries"; role alone if the entry is withdrawn; role tags on the leaderboard). The `withdrawn_by` name stays "the organizer".
**Earlier note (partly settled 2026-10-01):**
Members can't view other `users` (R-USR-V-01). **Settled for timelines:** `audit_log.actor` and `catches.judged_by` are labelled You, Angler, Judge, Backup judge or Organizer by comparing IDs the viewer can read (`decisions.md` "Catch history is public to members").
Screens: EVT-02a, EVT-02j.

**14. Settled 2026-10-02: fixed snapshots in `audit_log`.**
`decisions.md` "Audit rows store a fixed snapshot". Catch rows: `species`, `weight_hoz`, `length_q`, `status`, `reason`, `photo`, `photo_captured_at`, `flags`, `rev`. Entry rows: `withdrawn`, `withdraw_reason`, `withdrawn_by`. Event rows: every `events` field. The app compares `before` and `after` to show what changed. Test: R-AUD-H-05. This also gives the audit CSV fixed columns (Gap 15).
Screens: MY-06a, LB-03a, JDG-02a, ORG-07a.

**15. Settled 2026-10-05: CSV format and when the files can be built** (`decisions.md` "Results and audit CSV format", option b plus a preview). UTF-8 without BOM, LF, header row, comma-separated with standard quoting, UTC ISO 8601 timestamps, fixed sort (results: place, then `display_name`; audit: `created`, then row ID). Results carry raw integers plus readable columns in a fixed unit (decimal pounds to 0.01 lb, or inches to 0.25 in), never `display_units`. The hashed, postable files are built only when final; while closed the organizer can build an unhashed preview marked "Preview, not final". Exact column names are set in the S4 build.
Screens: ORG-07a, ORG-01d.

**16. Settled 2026-10-05: refusals are explained by reloading** (`decisions.md` "Refusals are explained by reloading", option a). After any refusal the app reloads the catch, entry and event and says what changed, inferred from `status`, `rev`, `submit_deadline`, `withdrawn` and the event status; if nothing explains it, it says the change wasn't accepted and offers Back. NOT SENT (no reply; Retry may help) stays separate from Not accepted (refused; Retry won't help).
Screens: SUB-02e, MY-03b, MY-04c, MY-05b, JDG-02b, JDG-02c, ORG-04b, ORG-05b, SYS-03a.

**17. Settled 2026-10-05: "now" comes from the server's clock** (`decisions.md` "\"Now\" comes from the server's clock", option a). The app corrects the phone's time by the offset from the server's `Date` header to show or hide Join, Submit, Edit, Close and the countdowns; refusals still follow Gap 16.
Screens: EVT-02, SUB-01, MY-02, ORG-01, ORG-05.

**18. Settled 2026-10-02: NOT SENT handling and repeated photo uploads.**
`decisions.md` "Every angler change echoes `rev`": the NOT SENT form is locked and leaving warns; before any retry the app reloads and compares `rev` and the photo count; every angler change sends the loaded `rev`, so a duplicate is refused even if two attempts are in flight, and the hook re-checks `rev` inside the save. Tests: R-CAT-U-39, U-40. To confirm on the pinned binary: that re-check (`security.md` open item 7).
Screens: SUB-02c, SUB-02d, MY-03a, MY-04a, MY-04b, MY-05a.

**19. Settled 2026-10-05 and 2026-10-07: sign-in wording, expired sessions and sign-in values** (`decisions.md` "Sign-in wording for an unknown email", option a). The email step always says "If that email is registered, a code is on its way" and moves on (AUTH-01b looks like AUTH-02a); after repeated network failures the app does a full page reload so an expired Cloudflare Access session can show its own sign-in. **Values settled 2026-10-07** (`decisions.md` "Sign-in values"): an 8-digit code, valid 10 minutes; "Send a new code" after 60 s; OTP requests and tries rate-limited per client IP; a 14-day PocketBase token, refreshed each time the app opens, alongside the 7-day Access session. Set and checked on the pinned binary in M0-06 (`ops.md` §14).
Screens: AUTH-01b, AUTH-02b, AUTH-02c, SYS-04a, LB-01b.

**20. Settled 2026-10-05: no blank names on the board** (`decisions.md` "No blank names on the board", both options). Inviting a member always sets their name (an `ops.md` step), which covers the automatically entered judge and backup judge; and Join asks for a name first if it's empty (new row EVT-02n). Two members with the same name are still told apart only by the superuser choosing distinct names.
Screens: EVT-02a, EVT-02n, PRF-01a, LB-01a.

**21. Settled 2026-10-05: the same angler and catch pages for everyone** (`decisions.md` "Judges and the organizer see the same angler and catch pages as everyone", option a). LB-02 and LB-03 show pending and verified catches only, for every viewer; judges use the queue's Rejected filter.
Screens: LB-02c, LB-03a.

**22. Settled 2026-10-03: one queue per tournament with Pending, Verified and Rejected filters** (`decisions.md` "Judge queue filters"; replaces "pending only"). Screens: JDG-01a, JDG-01f, JDG-01g.
**Earlier note (2026-10-02):**
`decisions.md` "Display decisions for the UI": the main queue lists **pending catches only**; approved and rejected catches are reached from other screens (catch review JDG-02, catch detail LB-03). The order and scope were defaults: one queue per tournament, oldest first by `created`.
Screens: JDG-01a, JDG-01b, JDG-02d.

**23. Settled 2026-10-02: members see times, not flags.**
`decisions.md` "Display decisions for the UI": on a catch, members see when it was submitted (`created`) and, when available, when the photo was taken (`captured_at`). Flag codes are shown only on the judge's screens (JDG-01, JDG-02), including in the timeline. This is a display choice: the API still returns `flags` to any member who can see the catch.
Screens: MY-02a, LB-02a, LB-03a.

**24. Settled 2026-10-03: yes, EVT-02j shows `withdraw_reason`** (`decisions.md` "A member withdrawn by the organizer sees the reason").
**Original question:** Does a withdrawn angler see the organizer's reason?
Screens: EVT-02j.

**25. Settled 2026-10-05: which screens update live** (`decisions.md` "Which screens update live"). Live on the leaderboard, the judge queue and the counts on Manage tournament; every other screen refreshes when opened and on focus. A final leaderboard shows no Live badge.
Screens: MY-01, MY-02, JDG-01, ORG-01, LB-01g.

**26. Settled 2026-10-02: measurement input.**
`decisions.md` "Display decisions for the UI": decimal pounds to two places (`0.00`); pounds and ounces with ounces to one place; length entered to the eighth inch, with the rounded-down quarter-inch value shown before sending. The judge's correction uses the same inputs. (An upper sanity limit is still unset; a typo like 43.0 lb would reach the judge, who corrects it.)
Screens: SUB-01a, SUB-01b, MY-03a, JDG-04a.

**27. Settled 2026-10-02: club time, 12-hour.**
`decisions.md` "Display decisions for the UI": every time is shown in America/New_York, the same on every phone whatever its own time zone, in 12-hour format. Organizer date fields are entered as club time and labelled "Eastern time" (Figma pass 2).
Screens: every screen that shows a time (EVT-02, SUB-02b, MY-02, MY-06, LB-01 to LB-03, JDG-01, JDG-02, ORG-01, ORG-02, ORG-03, ORG-04).

**28. Settled 2026-10-05: members see that the deadline was extended** (`decisions.md` "Members see when the deadline was extended", option a). An extended deadline reads "extended by n h after an outage" beside the new time.
Screens: EVT-02e, EVT-02f, SUB-01c.

**29. Settled 2026-10-03: home is a list (option A); two or more live entries land on it (EVT-01d); sign-out on Profile** (`decisions.md` "Home screen and landing").
Screens: AUTH-02a, EVT-01, LB-01, PRF-01.

**30. Settled 2026-10-02: species on biggest fish; best 10 marked.**
`decisions.md` "Display decisions for the UI": the leaderboard's "biggest fish" shows its species; an angler's catch list marks the catches in their counted best 10, on another angler's page (LB-02) and on your own (MY-01).
Screens: LB-01a, LB-02a, MY-01b.

**31. Settled 2026-10-05: an angler appears on the board with at least one pending or verified catch** (`decisions.md` "Who appears on the leaderboard", option a, matching `scoring.md` §9). The 2026-10-01 self-join row's "at least one catch" is read this way.
Screens: LB-01a, LB-01d.

**32. Settled 2026-10-03: from finalize (option a)** (`decisions.md` "Photo archived shows from finalize").
Screens: MY-01c, MY-02i, LB-02b, LB-03b, JDG-02h.

**33. Settled 2026-10-05 (`security.md` v0.9): every case below now has a test.**
- An angler sees their own retracted catch (MY-01b, MY-02h): R-CAT-L-11; own catches on a withdrawn entry: L-12.
- The organizer, when not the event's judge, can't judge (JDG-01e): R-CAT-U-46.
- The organizer withdraws their own entry with no reason (ORG-08b): R-ENT-U-13.
- The organizer withdraws or reinstates in a closed event (ORG-08a): R-ENT-U-14.
- Event field edits on a closed event: only `backup_judge` allowed (ORG-03b; Gap 9): R-EVT-U-23, U-24.
- `name` editable while live; `ends_at` later only while the window is open (ORG-03a; Gaps 9, 10): R-EVT-U-20 to U-22.
- The Open preconditions (ORG-01a; Gap 11): R-EVT-U-25.
- Raising `deadline_ext_min` after `submit_deadline` has passed, which reopens joining and submitting (ORG-01c): R-EVT-U-26.
- An angler reads every row of their own rejected or retracted catch (MY-06a): R-AUD-L-09.

**34. [Info] `dev-lifecycle-guide.md` conflicts, settled by precedence and, since 2026-10-07, fixed in the guide's v2.**
Listed so nobody reopens them: "director" (now judge, backup judge, organizer); `pb_public/scoring.js` (now `web/src/lib/scoring.ts`); "no build step" (now React + Vite + TypeScript); grace window `grace_min` (now `submit_deadline`); `min_length_q` and `dead` fields (dropped); roles `angler | director | admin` (now `member | organizer` plus per-event judges); T-7d freeze (now a 3-day hard freeze); "three screens" (index, submit, director); a DEC report screen (not pursued); tie-break by earliest submission (now fish by fish, then shared place); paper fallback and printable results (not in current docs).

**35. Settled 2026-10-02: every photo after the first gets the capture-time check.**
`decisions.md` "Every photo after the first gets the capture-time check": at submit and when added later, as `extra_photo_no_time` and `extra_photo_far`. Tests: R-CAT-C-20, C-22, U-34, U-35. The same day, two photos became required (`scoring.md` v0.5 draft, group sign-off pending), so every catch has at least one photo to check.
Screens: SUB-01a, MY-04a, JDG-01a, JDG-02a.

**36. Settled 2026-10-02: the code word may be in either required photo.**
`decisions.md` "Code word with two photos": when the code word is on, it must be visible in the holding photo or the scale/board photo; the judge checks it, and the app doesn't. Written into the `scoring.md` v0.5 draft §5 and §7.
Screens: SUB-01a, JDG-02a.

**37. Settled 2026-10-07: yes, from a tournament page** (`decisions.md` "Club rules also shows the open tournament's values", option B). Opened from home, club-wide rules only.
**Original question:** does Club rules also show the open tournament's values?
RULES-01a shows the club-wide upload rules. Opened from a tournament page, should it also show that tournament's species, metric, fishing window, final deadline (with the extension note) and whether the code word is on? (`decisions.md` "Proposed, not yet confirmed".)
Screens: RULES-01a.

**Other docs that were out of step** (not UI gaps; all done by 2026-10-06):
- ~~`claude/architecture.md` §2 and §3 still describe own-only audit visibility and have no `photo_captured_at` or two-photo rule.~~ Done in `architecture.md` v0.5 (2026-10-06).
- ~~`claude/features.json` doesn't cite the `security.md` v0.5 or v0.6 test IDs.~~ Done 2026-10-05: it cites every v0.9 test ID.
- ~~`security.md` needs the 2026-10-03 and 2026-10-05 rule changes (judge step-down; closed-event branch; later-only `ends_at`; Open preconditions; `name` while live).~~ Done in `security.md` v0.9.
- ~~`security.md` open item 8: some older tests use catches by X, whom the fixtures describe as not joined.~~ Done in v0.9 (fixture Y).
- ~~`claude/ops.md` still needs the judge step-down procedure (§12) and the "always set a name" invite step.~~ Done in `ops.md` v0.6 (2026-10-06).

---

## 6. Questions for Kayden

Highest impact first.

**Settled 2026-10-01** (recorded in `decisions.md` and `security.md` v0.5): Gap 1 (public catch history; `reason` stays one field), Gap 4 (`flags` codes), Gap 5 (photo limits), Gap 6 (capture time per photo), Gap 7 (outage extension as a new total in whole hours). Gaps 13, 21 and 22 are narrowed.

**Settled 2026-10-02** (recorded in `decisions.md`, `security.md` v0.6 to v0.8, and the `scoring.md` v0.5 draft): Gap 2 (reason on any re-judge), Gap 3 (correct approves, one row), Gap 14 (fixed audit snapshots), Gap 18 (`rev` echo and reload before retry), Gap 35 (every photo after the first is checked), Gap 36 (code word in either required photo), Gap 8 (judge must be an organizer; judge and backup judge entered automatically), Gap 12 (backup judge sees the judge's withdrawn entry; no handover in the MVP), Gaps 23, 26, 27, 30 and parts of 22 and 29 (display decisions).

**Settled 2026-10-03** (recorded in `decisions.md`): `scoring.md` v0.5 agreed; Gap 9 in part (code word can change live; judge only steps down, backup takes over), Gap 13 (names from entries), Gap 22 (queue filters), Gap 24 (reason shown), Gap 29 (home list; landing; sign-out on Profile), Gap 32 (archived from finalize).

**Settled 2026-10-05** (Figma pass 2, recorded in `decisions.md`): Gap 9 (rest), Gap 10, Gap 11, Gap 15, Gap 16, Gap 17, Gap 19 (wording; values still open), Gap 20, Gap 21, Gap 25, Gap 28, Gap 31. Later the same day: `scoring.md` v0.6 in force without a group vote; no entry for a backup judge named after close; ORG-08c dropped; the Finalize switch confirmed; Share added to exports.

**Settled 2026-10-07** (recorded in `decisions.md`): Gap 19 (sign-in values), Gap 37 (Club rules shows the tournament's values from a tournament page).

**Still open:** none here. Everything left (the phone checks from `claude/design-research.md` §12, the Figma fixes F1–F11) is in the one list, `decisions.md` Open items.
1. ~~`security.md` changes from the 2026-10-03 and 2026-10-05 rows (judge step-down; Gaps 9, 10, 11; no entry for a backup judge named after close).~~ Done in `security.md` v0.9.
2. ~~Sign-in values (Gap 19): code length, expiry, resend and attempt limits; token lifetime.~~ Settled 2026-10-07.
3. ~~The test gaps in Gap 33.~~ Settled in `security.md` v0.9.
4. ~~Phone checks from `claude/design-research.md` §12: the date picker, CSV file names in Files, the copied hash, and sharing a file from the app.~~ Moved to `decisions.md` Open items #6.
5. ~~Club rules: whether it also shows the open tournament's values (Gap 37).~~ Settled 2026-10-07.
6. ~~Figma frames for the 13 rows added in v0.6 (§7.3).~~ Done: JDG-00a, JDG-00b and RULES-01a in pass 3; the 10 NOT SENT rows in pass 3b (6 Oct).

---

## 7. Self-check

### 7.1 SPEC roles × capabilities

| SPEC row | Screens |
|---|---|
| See leaderboard | LB-01a to g, LB-02a to c, LB-03a, LB-03b (anonymous: none; AUTH only) |
| Join a tournament | EVT-02a, EVT-02n, EVT-02b (the judge and backup judge are entered automatically: ORG-02a) |
| Withdraw (own); organizer withdraws anyone with a reason, reinstates; backup judge own only | EVT-02c to j, EVT-03a, EVT-03b; ORG-08a, ORG-08b, ORG-09a, ORG-09b; S has no ORG-08 (R-ENT-U-12) |
| Submit; edit, add photos, retract while pending | SUB-01a to e, SUB-02a to e; MY-02a to d, MY-03a, MY-03b, MY-04a to c, MY-05a, MY-05b |
| Approve / reject / correct / re-judge; backup judge only the judge's | JDG-01a to g, JDG-02a to i, JDG-03a, JDG-04a, JDG-05a, JDG-05b |
| Create, open, close, finalize | ORG-01a to e, ORG-02a to c, ORG-05a, ORG-05b, ORG-06a, ORG-06b |
| Add a species | ORG-10a, ORG-10b |
| Change own name and display units | PRF-01a, PRF-01b |
| Change any role, delete anything | No screen, by design: shown only as "Actions NOT shown" (PRF-01a, MY-02a, ORG-01a, ORG-08a, ORG-10a) |
| Superuser column | Out of scope (PocketBase admin UI) |

### 7.2 SPEC "Must do"

| Must do item | Screens |
|---|---|
| 1. Sign-in (Access + OTP) | AUTH-00 (noted), AUTH-01, AUTH-02, SYS-04 |
| 1. Join on the tournament page | EVT-02a, EVT-02n |
| 1. One fish per submission, two required photos, species from the list, weight or length per metric | SUB-01a to d |
| 1. Capture time read, then metadata stripped | SUB-01a (read silently; no visible UI) |
| 1. Unique `client_uuid`; Sending / Received / NOT SENT + Retry | SUB-02a to e |
| 1. Edit, add photos (up to 4, append-only), retract while pending | MY-02, MY-03, MY-04, MY-05 |
| 1. Withdraw and rejoin | EVT-02c to j, EVT-03 |
| 2. Score: best 10, culls, ties, shared places, exclusions, per-member units | LB-01a, LB-01e, PRF-01a |
| 3. Queue with flags; approve, reject with reason, correct | JDG-01a, JDG-02a, JDG-03a, JDG-04a |
| 3. `rev` echoed; stale refused and reloaded | JDG-02b (and, since 2026-10-02, the angler's own changes: MY-03b, MY-04b, MY-04c, MY-05b) |
| 3. Re-judge while live or closed; no self-approval | JDG-05a, JDG-05b, JDG-02f |
| 3. Audit row readable by the angler | MY-06a (and, since 2026-10-01, by every member on visible catches: LB-03a) |
| 4. Close after the deadline; finalize refused while pending | ORG-05, ORG-06 |
| 4. Results and audit CSV built in the browser; SHA-256 shown | ORG-07a |
| 4. "Photo archived" | MY-01c, MY-02i, LB-02b, LB-03b, JDG-02h |

**Not mapped to any screen (by design, outside the app):** posting the hashes and standings in the group chat; the post-finalize backup; `archive-event.sh`; the desktop and laptop pulls and verification; removing photos from `pb_data`. These are host-side or manual steps in OPS §9 and §11. Nothing in SPEC's roles table or Must do list is otherwise unmapped.

### 7.3 Figma coverage (pass 3b, 6 Oct 2026)

Every row in section 2 (130) has exactly one frame on the Figma Flows page, named with its row ID (scripted check, 6 Oct). JDG-00a, JDG-00b and RULES-01a were drawn in pass 3; the 10 NOT SENT rows in pass 3b. Findings: `claude/review-figma-pass3.md`; frame IDs and sections: `claude/figma-file-map.md` (both in the Claude Project). RULES-01a's "This tournament" section, drawn as an option, is now the decided design (Gap 37), which settles review finding F4.
