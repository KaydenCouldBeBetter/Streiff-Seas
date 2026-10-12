# Security: Fishing Scoreboard

**Status:** Draft v0.10, 12 Oct 2026. v0.10 applies the M0-02 schema rows of `decisions.md` 2026-10-12: the seeded species are "largemouth bass" and "smallmouth bass", unique ignoring case; `users.name` and `species.name` refuse empty, all-space and badly spaced values (R-USR-U-07 and R-SPC-C-04 new, R-SPC-C-03 reworded); `audit_log.actor` is empty for a superuser action.

v0.9 (5 Oct 2026) applies the `decisions.md` entries of 2026-10-03 and 2026-10-05 and the independent review of 5 Oct 2026:
- Judge step-down (decided 2026-10-05): `judge` is locked for organizer edits once live (events update rule; R-EVT-U-18); the events hook lets a superuser step-down set a judge without the organizer role (R-EVT-U-19); the `audit_log` list rule gains a judge branch, so a judge without the organizer role reads every row of the catches they judge (R-AUD-L-08).
- Live and closed event edits (decided 2026-10-05): `name` and the code word change while live (R-EVT-U-20); once closed, only `backup_judge` changes, and the new backup judge gets no entry (events update rule and hook; R-EVT-U-23, U-24).
- `ends_at` moves later only, while the fishing window is open (hook; R-EVT-U-04 reworded, U-21, U-22).
- Open is refused until the draft is complete (hook; R-EVT-U-25). Raising the extension after `submit_deadline` reopens joining and submitting (R-EVT-U-26).
- Code word history on the event (decided 2026-10-05): new hook-set fields `code_word_prev` and `code_word_changed_at`; the create and update rules refuse them in a body (R-EVT-C-10, U-27 to U-29).
- A judge update must set a status or change the species or measurement, so a reason can't be rewritten on its own (catches update rule; R-CAT-U-45).
- Fixtures: **O** (an organizer who judges no event) and **Y** (an angler in E1) added; every event's judge and backup judge stated; rows that used X's catches or entry now use Y (open item 8 closed).
- Cells the screens rely on that had no test (`claude/screens.md` Gap 33): R-CAT-L-11, L-12, F-04, C-23, U-46, R-ENT-U-13, U-14, R-AUD-L-09.
- Conventions: the two sweep action codes, and the one superuser test.

v0.8 (2 Oct 2026) applied the `decisions.md` entry "Backup judge sees the judge's withdrawn entry": one new branch in the `entries` list rule; R-ENT-L-06 new.

v0.7 applied the `decisions.md` entry "Judge must be an organizer; judge and backup judge are entered automatically": events create rule and hooks changed; R-ENT-C-08 changed; R-EVT-C-07 to C-09, R-EVT-U-16, U-17 new; fixtures note the automatic entries.

v0.6 applied the six `decisions.md` entries of 2026-10-02:
- Two required photos (holding the fish; on the scale or board), app-enforced: create rule needs ≥ 2 files; R-CAT-C-01 changed, C-21 new. **Depends on `scoring.md` v0.5, group sign-off pending.**
- Anglers echo `rev` on every change, and the hook re-checks it inside the save: angler branch changed; R-CAT-U-20 changed, U-39 and U-40 new.
- Correct is one action that leaves the catch verified: R-CAT-U-04 changed, U-41 and U-44 new.
- A reason on any change to a decision already made: R-CAT-U-42, U-43 new.
- Fixed `before` / `after` snapshots in `audit_log`: R-AUD-H-05 new.
- Every photo after the first gets the capture-time check; codes renamed `extra_photo_no_time`, `extra_photo_far`: R-CAT-C-20, U-34, U-35 changed, C-22 new.

v0.5 (1 Oct 2026) applied the five `decisions.md` entries of 2026-10-01 that came out of the `screens.md` inventory:
- Members can read the audit history of any catch they can see: new `audit_log` list rule; R-AUD-L-02 and L-05 changed, L-06 and L-07 new.
- A capture time per photo, in the new `photo_captured_at` field: R-CAT-C-19, U-34 to U-37.
- `flags` as fixed codes: R-CAT-C-20, U-38.
- Photo limits: `image/jpeg` only, 5 MB per file; R-CAT-C-16 and U-27 reworded.
- `deadline_ext_min` in whole hours: R-EVT-U-15.

v0.4 added the outage-extension cells (R-EVT-C-06, R-EVT-U-12 to 14, R-CAT-C-17), rows for the organizer and backup judge acting as ordinary anglers (R-USR-C-03, R-SPC-L-03, R-SPC-U-02, R-ENT-C-08, R-CAT-C-18, R-AUD-C-02, R-AUD-U-02), the sweep rows (`R-ALL-*`) that cover every collection × action × role cell without a dedicated row, and the Access settings confirmed in `decisions.md` on 2026-10-01. Rules matrix: every collection × action × role has an expected result and a test ID in `test/rules.test.ts`, either in its own row or through a sweep. Built from `SPEC.md`, `decisions.md` (entries through 2026-10-05) and `architecture.md` §3. **The rule text is a draft until its tests pass against the pinned binary.** The tests are the source of truth, not the syntax on this page.

## Conventions
- **Test IDs:** `R-<COLLECTION>-<ACTION>-NN`. Collections: `USR`, `EVT`, `SPC`, `ENT`, `CAT`, `AUD`, plus `ALL` for sweeps that run one case against every collection; a sweep's action may also be `ANON` (every action, anonymously) or `S` (member cases re-run as a backup judge). Actions: `L` list, `V` view, `C` create, `U` update, `D` delete, plus `A` auth settings, `F` file (photo) access, `H` hook-written rows. Realtime subscriptions follow the list/view rules, so they are covered by `L` and `V`, with one explicit realtime test (R-CAT-L-09).
- **What "Deny" means:** the change did not happen, or for reads the row is absent. On a list, a failing rule acts as a filter, so the row is just missing; on a view, the record isn't found; a `null` rule refuses outright. Each test asserts the exact status code it sees on the pinned binary.
- **Enforced by:** *rule* (API rule, runs before hooks), *hook* (`pb_hooks`, runs after the rule passes), *index* (unique index), *schema* (field options). A rule must reject forbidden fields itself; hooks are defense in depth unless a cell says the hook is the only check.
- **Syntax:** pinned PocketBase v0.40.x. `@request.body`, never `@request.data`. In an **update** rule, a bare field (`status`) is the stored value and `@request.body.status` is the new one. In a **create** rule, bare fields and relations resolve against the submitted body (since v0.24).
- **Delete rules:** `null` on every collection. Nothing is deleted through the API (invariant 6).
- **Superuser** bypasses all rules and is not tested here, except where a hook treats a superuser request differently (R-EVT-U-19); every use during a tournament is logged in `ops.md` §12.
- Every test also runs with Access absent (invariant 8).

## Test fixtures
One seeded world, booted from an empty `pb_data` per test file.

| Name | Who | Notes |
|---|---|---|
| **K** | Kayden, `role = organizer` | Judge of every event |
| **O** | Olivia, `role = organizer` | Judges no event; for organizer-not-judge cases |
| **S** | Sam, member | Backup judge of E1 only |
| **N** | member | Backup judge of E2, EL, ED, EC and EF |
| **M** | member | Ordinary angler, joined E1 |
| **W** | member | Joined E1, then withdrawn |
| **X** | member | Not joined to anything (joins E1 in R-ENT-C-01) |
| **Y** | member | Joined E1; has pending, verified, rejected and retracted catches |
| anon | no auth | — |

Events: **E1** live (largemouth bass, smallmouth bass; weight; judge K, backup S), **E2** live (judge K, backup N), **EL** live, length metric, **ED** draft, **EC** closed, **EF** final (each with judge K, backup N, so S's scope stays E1 only). ED is complete enough to open, so each R-EVT-U-25 case removes one thing. E1's code word is on (OAK). Species: largemouth bass, smallmouth bass, walleye (walleye not allowed in E1). Each event's entries and catches cover pending, verified and rejected states, including catches by K. E1 also holds one catch by S that K rejected and then re-approved (for R-AUD-L-07). Every seeded catch has the two required photos. Each event's judge and backup judge have entries created with the event (K in every event; S in E1; N in the others).

## Collections (fields that matter to rules)
- `users` (auth): `email`, `name` (required: one or more words with single spaces, since it is the board name), `role` (member | organizer), `display_units` (lb | lb_oz; empty reads as lb), `verified`. Sign-in is OTP only.
- `events`: `name`, `status` (draft | live | closed | final), `starts_at`, `ends_at`, `deadline_ext_min` (int minutes, default 0: the outage extension. The organizer sets the new total in whole hours, only while live, and it is never lowered; decided 2026-10-01), `submit_deadline` (hook: ends_at + 24 h + `deadline_ext_min`), `metric` (weight | length), `best_n`, `judge` → users, `backup_judge` → users, `species` → species (multi), `code_word_on`, `code_word`, `code_word_prev` (hook: the word before the last change on a live event; empty until then), `code_word_changed_at` (hook: when that change happened; empty until then). Both history fields are readable by every member who can read the event (decided 2026-10-05)
- `species`: `name` (unique ignoring case; one or more words with single spaces). Seeded with largemouth bass and smallmouth bass; the organizer can add more (walleye) for future tournaments.
- `entries`: `event`, `angler` → users, `display_name` (hook), `withdrawn` (bool), `withdraw_reason`, `withdrawn_by` → users (hook), `created`. Unique index on (`event`, `angler`).
- `catches`: `entry`, `species`, `weight_hoz`, `length_q`, `photo` (protected, **multi-file, 2 to 4, append-only**: photo 1 is the angler holding the fish and photo 2 the fish on the scale or board, both required at create; photos 3 and 4 are optional, at create or added later. An angler may add photos to a pending catch but never remove or replace one, so the first two keep their meaning; `image/jpeg` only, 5 MB per file; the browser resizes to a 2560 px long edge before upload), `captured_at` (client-read from the **first** photo, signal only), `photo_captured_at` (JSON array, client-read: one capture time per photo in `photo` order, `null` when missing; its first entry equals `captured_at`; append-only like `photo`; signal only), `client_uuid` (unique), `rev` (int, hook: 1 on create, +1 on each angler edit; every angler and judge update must echo the current value), and server-checked `status` (pending | verified | rejected | retracted), `judged_by` (hook), `reason`, `flags` (hook: JSON array of codes, see "Flag codes"), `created`, `updated`.
- `audit_log`: `actor` (empty for a superuser action, such as the judge step-down), `action` (join, withdraw, rejoin, create, edit, retract, approve, reject, correct, open, close, finalize, event_edit), `event` → events, `catch` → catches (empty for event and entry actions), `target_id`, `before`, `after` (fixed snapshots, see "Audit snapshots" under `audit_log`), `created`.

---

## Matrix

### users

**List / view**
```
@request.auth.id != "" &&
(id = @request.auth.id || @request.auth.role = "organizer")
```
**Create:** `null` (members are invited by the superuser before the season). **Update:**
```
@request.auth.id != "" &&
id = @request.auth.id &&
@request.body.role:changed = false &&
@request.body.email:isset = false &&
@request.body.verified:isset = false
```
**Delete:** `null`. **manageRule:** `null`.

**Auth settings (collection options):** OTP on; password auth off; OAuth2 off.

**Hook (users update):** when `name` changes, copy it to `display_name` on the user's entries in events that aren't `final`. Final results keep the name they were published with.

| ID | Who | Case | Expected | By |
|---|---|---|---|---|
| R-USR-L-01 | anon | List users | No records | rule |
| R-USR-L-02 | M | List users | Only M's own record | rule |
| R-USR-L-03 | K | List users | All users (needed to pick judges) | rule |
| R-USR-V-01 | M | View X's record | Deny | rule |
| R-USR-V-02 | M | View own record | Allow | rule |
| R-USR-C-01 | anon | Sign up | Deny | rule |
| R-USR-C-02 | M | Create a user | Deny | rule |
| R-USR-C-03 | K | Create a user (the organizer role is not the superuser) | Deny | rule |
| R-USR-U-01 | M | Change own `name`, `display_units` | Allow | rule |
| R-USR-U-02 | M | Set own `role = organizer` | Deny | rule |
| R-USR-U-03 | M | Change own `email` or `verified` | Deny | rule |
| R-USR-U-04 | M | Update X's record | Deny | rule |
| R-USR-U-05 | K | Change M's `role` | Deny (roles change only by superuser) | rule |
| R-USR-U-06 | M | Change own `name` | Allow; `display_name` updates on M's entries in live and closed events, not in final ones | rule, hook |
| R-USR-U-07 | M | Change own `name` to empty, only spaces, or a name with leading, trailing or doubled spaces | Deny | schema |
| R-USR-D-01 | M, K | Delete a user, including self | Deny | rule |
| R-USR-A-01 | anon | Password sign-in with a real member's email | Refused | settings |
| R-USR-A-02 | anon | Request an OTP for an unlisted email | No user created | settings |

### events

**List / view**
```
@request.auth.id != "" &&
(status != "draft" || @request.auth.role = "organizer")
```
**Create**
```
@request.auth.role = "organizer" &&
@request.body.status = "draft" &&
@request.body.submit_deadline:isset = false &&
@request.body.deadline_ext_min:isset = false &&
@request.body.code_word_prev:isset = false &&
@request.body.code_word_changed_at:isset = false &&
@request.body.judge != @request.body.backup_judge &&
judge.role = "organizer"
```
`judge.role = "organizer"` (decided 2026-10-02): in a create rule, relations resolve against the submitted body, so this checks the chosen judge. The hooks repeat the check on create and update.

**Hook (events create):** refuse unless `judge` holds `role = organizer`. In the same transaction, create an entry for the judge and, if set, the backup judge (through `$app.save()`, so the entries create rule, which needs a live event, doesn't apply), each with `display_name` from the user and a `join` audit row whose actor is the organizer who created the event.

**Update**
```
@request.auth.role = "organizer" &&
status != "final" &&
@request.body.submit_deadline:isset = false &&
(@request.body.deadline_ext_min:isset = false || status = "live") &&
@request.body.code_word_prev:isset = false &&
@request.body.code_word_changed_at:isset = false &&
(status = "draft" || (
  @request.body.metric:changed = false &&
  @request.body.best_n:changed = false &&
  @request.body.species:changed = false &&
  @request.body.starts_at:changed = false &&
  @request.body.judge:changed = false
)) &&
(status != "closed" || (
  @request.body.name:changed = false &&
  @request.body.code_word_on:changed = false &&
  @request.body.code_word:changed = false &&
  @request.body.ends_at:changed = false
))
```
`judge` is locked for the organizer once the event is live (decided 2026-10-05): a judge changes only by the superuser step-down, which bypasses this rule and is checked by the hook. Once closed, only `backup_judge` (and the status step to final) can change.

**Hook (events update):** status moves only one step forward: draft → live → closed → final. Close is refused before `submit_deadline`; final is refused while any catch in the event is `pending`. It recomputes `submit_deadline` (= `ends_at` + 24 h + `deadline_ext_min`) when either changes. It refuses lowering `deadline_ext_min` (an outage extension only ever grows) and any value that isn't a whole number of hours (a multiple of 60), refuses an `ends_at` earlier than the stored one, and any `ends_at` change once the server time is past the stored `ends_at` or the event is closed (decided 2026-10-05); refuses draft → live unless `starts_at` is before `ends_at`, at least one species is set, `judge` and `backup_judge` are both set and different, and `code_word` isn't empty when `code_word_on` is set (decided 2026-10-05); when `code_word` changes on a live event, sets `code_word_prev` to the stored word and `code_word_changed_at` to the server time (decided 2026-10-05); refuses `judge = backup_judge`; refuses a `judge` without `role = organizer`, except on a superuser request that sets `judge` to the person who was `backup_judge` before the request (judge step-down, decided 2026-10-05); and writes an audit row for every change. When `judge` or `backup_judge` changes on a draft or live event, it creates an entry (and a `join` row) for the new person if they have none in this event; on a closed event it creates none (decided 2026-10-05); the previous person's entry is left as it is, and they or the organizer withdraw it if they aren't fishing. **Delete:** `null`.

| ID | Who | Case | Expected | By |
|---|---|---|---|---|
| R-EVT-L-01 | anon | List events | No records | rule |
| R-EVT-L-02 | M | List events | Live, closed and final; no drafts | rule |
| R-EVT-L-03 | K | List events | All, including drafts | rule |
| R-EVT-V-01 | M | View ED | Deny | rule |
| R-EVT-C-01 | K | Create a draft | Allow; `submit_deadline` = `ends_at` + 24 h | rule, hook |
| R-EVT-C-02 | M, S | Create an event | Deny | rule |
| R-EVT-C-03 | K | Create with `status = live` | Deny | rule |
| R-EVT-C-04 | K | Body sets `submit_deadline` | Deny | rule |
| R-EVT-C-05 | K | `judge` = `backup_judge` | Deny | rule |
| R-EVT-C-06 | K | Body sets `deadline_ext_min` | Deny | rule |
| R-EVT-C-07 | K | Create with `judge` = M (a member, not an organizer) | Deny | rule, hook |
| R-EVT-C-08 | K | Create a draft with judge K and backup judge S | Allow; entries for K and S created, each with `display_name` and one `join` row; members can't list them until the event is live (R-ENT-L-02) | hook |
| R-EVT-C-09 | K | Create a draft with no backup judge | Allow; an entry for the judge only | hook |
| R-EVT-C-10 | K | Body sets `code_word_prev` or `code_word_changed_at` | Deny | rule |
| R-EVT-U-01 | K | Edit any field on a draft | Allow | rule |
| R-EVT-U-02 | M, S | Update any event | Deny | rule |
| R-EVT-U-03 | K | Change `metric`, `best_n`, `species` or `starts_at` on a live event | Deny | rule |
| R-EVT-U-04 | K | Change `backup_judge`, or move `ends_at` later while the window is open, on a live event | Allow; audited; deadline recomputed | rule, hook |
| R-EVT-U-05 | K | Any change to EF | Deny | rule |
| R-EVT-U-06 | K | draft → live | Allow; audit row `open` | hook |
| R-EVT-U-07 | K | live → closed before `submit_deadline` | Deny | hook |
| R-EVT-U-08 | K | closed → final with a pending catch | Deny | hook |
| R-EVT-U-09 | K | Skip a step (draft → closed or final, live → final) | Deny | hook |
| R-EVT-U-10 | K | Go backward (closed → live) | Deny | hook |
| R-EVT-U-11 | K | Set `judge = backup_judge` on update | Deny | hook |
| R-EVT-U-12 | K | Raise `deadline_ext_min` to a higher whole-hour total on E1 (live) after an outage | Allow; `submit_deadline` = `ends_at` + 24 h + extension; `ends_at` unchanged; `event_edit` row | rule, hook |
| R-EVT-U-13 | K | Lower `deadline_ext_min` on a live event | Deny | hook |
| R-EVT-U-14 | K | Set `deadline_ext_min` on ED or EC | Deny | rule |
| R-EVT-U-15 | K | Set `deadline_ext_min` on E1 to a value that isn't a multiple of 60 | Deny | hook |
| R-EVT-U-16 | K | Change `judge` to a member without the organizer role, on ED or E1 | Deny | hook (ED); rule (E1) |
| R-EVT-U-17 | K | Change `backup_judge` on ED from S to N | Allow; N gets an entry and a `join` row; S's entry is unchanged; a second change back to S creates nothing new | hook |
| R-EVT-U-18 | K | Change `judge` on E1 (live) to O | Deny | rule |
| R-EVT-U-19 | superuser | Step-down on E1, in its own test file: `judge` → S, `backup_judge` → N in one request | Allow; the hook doesn't refuse S's member role; N gets an entry and a `join` row; K's entry is unchanged; one `event_edit` row | hook |
| R-EVT-U-20 | K | Change `name`, `code_word_on` or `code_word` on E1 | Allow; one `event_edit` row each | rule, hook |
| R-EVT-U-21 | K | Move `ends_at` later on E1 while the window is open | Allow; `submit_deadline` recomputed; `event_edit` row | hook |
| R-EVT-U-22 | K | Move `ends_at` earlier on E1, or later after the window has closed (live, past `ends_at`) | Deny | hook |
| R-EVT-U-23 | K | Change `backup_judge` on EC from N to S | Allow; no entry and no `join` row created; one `event_edit` row | rule, hook |
| R-EVT-U-24 | K | Change `name`, `code_word_on`, `code_word`, `ends_at` or `judge` on EC | Deny | rule |
| R-EVT-U-25 | K | Open ED with, in turn: `starts_at` not before `ends_at`; no species; no backup judge; `code_word_on` with an empty `code_word` | Deny each; ED stays a draft | hook |
| R-EVT-U-26 | K | Raise `deadline_ext_min` on a live event after `submit_deadline` has passed | Allow; X can join and M can submit until the new deadline | rule, hook |
| R-EVT-U-27 | K | Change `code_word` on E1 from OAK to MAPLE | Allow; `code_word_prev` = OAK; `code_word_changed_at` = server time; one `event_edit` row | hook |
| R-EVT-U-28 | K | Update body sets `code_word_prev` or `code_word_changed_at` | Deny | rule |
| R-EVT-U-29 | K | Change `code_word` on ED | Allow; `code_word_prev` and `code_word_changed_at` stay empty | hook |
| R-EVT-D-01 | K | Delete an event | Deny | rule |

### species

**List / view:** `@request.auth.id != ""`. **Create:** `@request.auth.role = "organizer"`. **Update:** `null` (a typo is fixed by the superuser, logged). **Delete:** `null`.

| ID | Who | Case | Expected | By |
|---|---|---|---|---|
| R-SPC-L-01 | anon | List species | No records | rule |
| R-SPC-L-02 | M | List species | All | rule |
| R-SPC-L-03 | K | List species | All | rule |
| R-SPC-C-01 | K | Add walleye | Allow | rule |
| R-SPC-C-02 | M | Add a species | Deny | rule |
| R-SPC-C-03 | K | Add a duplicate name, including one that differs only in case | Fails | index |
| R-SPC-C-04 | K | Add a name that is empty, only spaces, or has leading, trailing or doubled spaces | Fails | schema |
| R-SPC-U-01 | K | Rename a species | Deny | rule |
| R-SPC-U-02 | M | Rename a species | Deny | rule |
| R-SPC-D-01 | K | Delete a species | Deny | rule |

### entries

**List / view**
```
@request.auth.id != "" &&
event.status != "draft" &&
(withdrawn = false ||
 angler = @request.auth.id ||
 event.judge = @request.auth.id ||
 (event.backup_judge = @request.auth.id && angler = event.judge) ||
 @request.auth.role = "organizer")
```
The backup-judge branch (decided 2026-10-02) lets the backup judge read the judge's entry even after the judge withdraws, so the catches they still have to judge keep a name. It grants nothing else: the backup judge still can't see anyone else's withdrawn entry, or change any entry (R-ENT-U-12).

**Create** (self-join)
```
@request.auth.id != "" &&
@request.body.angler = @request.auth.id &&
event.status = "live" &&
@now <= event.submit_deadline &&
@request.body.display_name:isset = false &&
@request.body.withdrawn:isset = false &&
@request.body.withdraw_reason:isset = false &&
@request.body.withdrawn_by:isset = false
```
**Update** (withdraw and rejoin; two branches)
```
@request.auth.id != "" &&
event.status != "final" &&
@request.body.withdrawn:isset = true &&
@request.body.event:isset = false &&
@request.body.angler:isset = false &&
@request.body.display_name:isset = false &&
@request.body.withdrawn_by:isset = false &&
(
  (angler = @request.auth.id &&
   @request.body.withdraw_reason:isset = false &&
   ((@request.body.withdrawn = true && withdrawn = false) ||
    (@request.body.withdrawn = false && withdrawn = true &&
     withdrawn_by = @request.auth.id &&
     event.status = "live" && @now <= event.submit_deadline)))
  ||
  (@request.auth.role = "organizer" &&
   (@request.body.withdrawn = false ||
    angler = @request.auth.id ||
    @request.body.withdraw_reason != ""))
)
```
`withdrawn_by` is what stops an angler from undoing the organizer's removal: they can rejoin only if they withdrew themselves.

**Hooks:** on create, set `display_name` from the user and write a `join` row. On update, set `withdrawn_by` to the caller (cleared on rejoin) and write a `withdraw` or `rejoin` row. **Delete:** `null`.

| ID | Who | Case | Expected | By |
|---|---|---|---|---|
| R-ENT-L-01 | anon | List entries | No records | rule |
| R-ENT-L-02 | M | List entries | Non-withdrawn entries in live, closed and final events | rule |
| R-ENT-L-03 | M | List entries | W's withdrawn entry is absent | rule |
| R-ENT-L-04 | W | List entries | Own withdrawn entry is present | rule |
| R-ENT-L-05 | K | List entries | All, including withdrawn | rule |
| R-ENT-L-06 | S | List entries in E1 after K withdraws own entry | K's withdrawn entry present; W's withdrawn entry still absent; in E2, K's entry follows the member rule | rule |
| R-ENT-C-01 | X | Join E1 | Allow; `display_name` set; `join` row | rule, hook |
| R-ENT-C-02 | X | Join E1 as M | Deny | rule |
| R-ENT-C-03 | M | Join E1 again | Fails; one entry | index |
| R-ENT-C-04 | X | Join ED, EC or EF | Deny | rule |
| R-ENT-C-05 | X | Join a live event after `submit_deadline` | Deny | rule |
| R-ENT-C-06 | X | Body sets `display_name`, `withdrawn`, `withdraw_reason` or `withdrawn_by` | Deny | rule |
| R-ENT-C-07 | anon | Join | Deny | rule |
| R-ENT-C-08 | K, S | Join E1, where both were entered automatically when E1 was created | Fails; still one entry each (the judge and backup judge fish too) | index |
| R-ENT-U-01 | M | Withdraw own entry in E1 | Allow; `withdrawn_by` = M; `withdraw` row | rule, hook |
| R-ENT-U-02 | M | Withdraw own entry in EC | Allow | rule |
| R-ENT-U-03 | M | Rejoin after withdrawing self, E1 live, before deadline | Allow; `rejoin` row | rule, hook |
| R-ENT-U-04 | W | Rejoin after K withdrew them | Deny | rule |
| R-ENT-U-05 | M | Rejoin after `submit_deadline`, or in EC | Deny | rule |
| R-ENT-U-06 | M | Withdraw Y's entry | Deny | rule |
| R-ENT-U-07 | K | Withdraw M with a reason | Allow | rule |
| R-ENT-U-08 | K | Withdraw M without a reason | Deny | rule, hook |
| R-ENT-U-09 | K | Reinstate W | Allow; `rejoin` row | rule, hook |
| R-ENT-U-10 | K, M | Any change to an entry in EF | Deny | rule |
| R-ENT-U-11 | M, K | Body changes `event`, `angler`, `display_name` or `withdrawn_by` | Deny | rule |
| R-ENT-U-12 | S | Withdraw M (backup judge, not organizer) | Deny | rule |
| R-ENT-U-13 | K | Withdraw own entry in E1 without a reason | Allow; `withdrawn_by` = K; `withdraw` row | rule, hook |
| R-ENT-U-14 | K | In EC, withdraw M with a reason, and reinstate W | Allow; one `withdraw` and one `rejoin` row | rule, hook |
| R-ENT-D-01 | M, K | Delete an entry | Deny | rule |

### catches

**List / view** (rejected and retracted catches are visible only to the angler and the judges)
```
@request.auth.id != "" &&
(
  (status != "rejected" && status != "retracted" && entry.withdrawn = false) ||
  entry.angler = @request.auth.id ||
  entry.event.judge = @request.auth.id ||
  (entry.event.backup_judge = @request.auth.id && entry.angler = entry.event.judge) ||
  @request.auth.role = "organizer"
)
```
**Create**
```
@request.auth.id != "" &&
entry.angler = @request.auth.id &&
entry.withdrawn = false &&
entry.event.status = "live" &&
@now >= entry.event.starts_at &&
@now <= entry.event.submit_deadline &&
entry.event.species.id ?= species &&
((entry.event.metric = "weight" && @request.body.weight_hoz > 0 && @request.body.length_q:isset = false) ||
 (entry.event.metric = "length" && @request.body.length_q > 0 && @request.body.weight_hoz:isset = false)) &&
@request.body.photo:length >= 2 &&
@request.body.status:isset = false &&
@request.body.judged_by:isset = false &&
@request.body.reason:isset = false &&
@request.body.flags:isset = false &&
@request.body.rev:isset = false
```
`@request.body.photo:length >= 2` enforces the two required photos (decided 2026-10-02). Confirm on the pinned binary that `:length` counts the uploaded files in a multipart create; the create hook repeats the check either way.
**Update** (two branches: an angler editing or retracting their own pending catch, or a judge acting on someone else's)
```
@request.auth.id != "" &&
@request.body.entry:isset = false &&
@request.body.captured_at:isset = false &&
@request.body.client_uuid:isset = false &&
@request.body.judged_by:isset = false &&
@request.body.flags:isset = false &&
(@request.body.species:isset = false || entry.event.species.id ?= @request.body.species) &&
(@request.body.weight_hoz:isset = false || (entry.event.metric = "weight" && @request.body.weight_hoz > 0)) &&
(@request.body.length_q:isset = false || (entry.event.metric = "length" && @request.body.length_q > 0)) &&
(
  (entry.angler = @request.auth.id &&
   status = "pending" &&
   entry.withdrawn = false &&
   entry.event.status = "live" &&
   @now <= entry.event.submit_deadline &&
   (@request.body.status:isset = false || @request.body.status = "retracted") &&
   @request.body.reason:isset = false &&
   @request.body.rev:isset = true &&
   @request.body.rev = rev)
  ||
  (entry.angler != @request.auth.id &&
   (entry.event.judge = @request.auth.id ||
    (entry.event.backup_judge = @request.auth.id && entry.angler = entry.event.judge)) &&
   (entry.event.status = "live" || entry.event.status = "closed") &&
   status != "retracted" &&
   @request.body.photo:isset = false &&
   @request.body.photo_captured_at:isset = false &&
   @request.body.rev:isset = true &&
   @request.body.rev = rev &&
   (@request.body.status:isset = true ||
    @request.body.species:isset = true ||
    @request.body.weight_hoz:isset = true ||
    @request.body.length_q:isset = true) &&
   (@request.body.status:isset = false ||
    @request.body.status = "verified" || @request.body.status = "rejected") &&
   (@request.body.status != "rejected" || @request.body.reason != "") &&
   (@request.body.status != "rejected" ||
    (@request.body.species:isset = false &&
     @request.body.weight_hoz:isset = false &&
     @request.body.length_q:isset = false)) &&
   (status = "pending" ||
    @request.body.status:isset = false ||
    @request.body.status = status ||
    @request.body.reason != ""))
)
```
The last two clauses of the judge branch (decided 2026-10-02): a correction can't be combined with a rejection, and changing the status of a catch that was already judged needs a reason. Since v0.9 a judge request must also set `status` or change `species`, `weight_hoz` or `length_q`, so `reason` can't be rewritten on its own (review, 2026-10-05).

**Why `rev`:** since anglers can edit pending catches, a judge could otherwise approve a value the angler changed after the judge loaded it. The judge's request must echo the `rev` it saw. If the angler edited in between, `rev` has moved on, the approval is refused, and the queue reloads. Since 2026-10-02 **the angler's own requests echo `rev` too**: the rule refuses a stale value, so a retried photo upload whose first attempt already landed is refused instead of adding the photo twice, and two of the angler's devices can't overwrite each other. The angler can only echo `rev`, never change it; the hook still sets it. Because the rule reads `rev` before the save, the hook re-reads it inside the save transaction and refuses if it moved, so two near-simultaneous requests can't both pass.

**Flag codes** (decided 2026-10-01; extra-photo codes renamed and widened 2026-10-02). `flags` is a JSON array. The hook adds codes and never removes one; a flag records what happened, and the judge's decision is what settles it. No numbers are stored: the queue derives hours from `captured_at` and `created`. One list is shared by the hook and the web app.

| Code | Set when | Set on |
|---|---|---|
| `no_capture_time` | `captured_at` is empty | create |
| `before_window` | `captured_at` < `starts_at` | create |
| `after_window` | `captured_at` > `ends_at` (the window never moves, even with an outage extension) | create |
| `late_submit` | `created` − `captured_at` > 24 h | create |
| `photo_added` | The angler adds a photo after submission | angler update |
| `extra_photo_no_time` | A photo after the first has no capture time | create and angler update |
| `extra_photo_far` | A photo after the first has a capture time more than 24 h from `captured_at` (either side) | create and angler update, only when both times exist |

**Hooks:**
- **On create:** force `status = pending` and `rev = 1`; refuse fewer than 2 photos (backs up the rule); check the image type and size; refuse unless `photo_captured_at` has one entry per uploaded file and its first entry equals `captured_at` (both may be empty); strip or refuse location data; set `flags` from the create-time codes above, checking every photo after the first; write a `create` row.
- **On update by the angler:** re-read the stored `rev` inside the save transaction and refuse if it no longer matches the request; refuse unless the new `photo` list still contains every existing file in the same order (append-only; checked against the original record before save, so a refused request deletes nothing), and `photo_captured_at` keeps every existing entry unchanged and has exactly one entry per photo. Strip location from added photos, add `photo_added` and, per added photo, `extra_photo_no_time` or `extra_photo_far`, `rev + 1`, and write an `edit` row (or a `retract` row when `status` becomes `retracted`).
- **On update by a judge:** re-read `rev` inside the save transaction as above; set `judged_by`; require `reason` on reject, on any change to `species`, `weight_hoz` or `length_q`, and on any status change of a catch already judged. **A correction** (any change to `species`, `weight_hoz` or `length_q`) **sets `status = verified`** and writes exactly one `correct` row, whatever the status was before; otherwise write one `approve` or `reject` row. `flags` is left as it is.
- **Every audit row** carries the fixed snapshots described under `audit_log`.

**Retract, not delete.** "Delete and resubmit" is a retract: the angler sets their own pending catch to `retracted`, it disappears for everyone but them and the judges, it never scores, and it doesn't hold up finalize. They then submit a new catch. The record and its photos stay, so invariant 6 holds and the audit trail is intact. A retracted catch can't be un-retracted or judged.

**Delete:** `null`. **Photo:** protected file; access needs a file token, which is granted only if the `catches` view rule passes.

| ID | Who | Case | Expected | By |
|---|---|---|---|---|
| R-CAT-L-01 | anon | List catches | No records | rule |
| R-CAT-L-02 | M | List catches | Pending and verified catches on non-withdrawn entries | rule |
| R-CAT-L-03 | M | List catches | Another angler's rejected catch is absent | rule |
| R-CAT-L-04 | M | List catches | Own rejected catch present, with `reason` | rule |
| R-CAT-L-05 | K | List catches in E1 | All, including rejected | rule |
| R-CAT-L-06 | S | List catches in E1 | Rejected catches only where the angler is K or S | rule |
| R-CAT-L-07 | M | List catches | Catches on W's withdrawn entry are absent | rule |
| R-CAT-L-08 | K | List catches (organizer) | All, in every event | rule |
| R-CAT-L-09 | M | Subscribed to `catches` while K rejects Y's catch | M receives no event for it | rule |
| R-CAT-L-10 | M | List catches | Y's retracted catch is absent | rule |
| R-CAT-L-11 | Y | List catches | Own retracted catch present | rule |
| R-CAT-L-12 | W | List catches | Own catches on the withdrawn entry present | rule |
| R-CAT-V-01 | M | View another angler's rejected catch | Deny | rule |
| R-CAT-F-01 | anon or M | Fetch a photo URL without a file token | Deny | schema |
| R-CAT-F-02 | M | Fetch a visible catch's photo with a file token | Allow | rule |
| R-CAT-F-03 | M | Fetch another angler's rejected photo with a file token | Deny | rule |
| R-CAT-F-04 | K, S, N | Fetch the photo of a rejected catch with a file token: K for Y's, S for K's, N for K's in E1 | K and S: Allow; N: Deny | rule |
| R-CAT-C-01 | M | Own entry, live event, inside window, clean body with the two required photos | Allow; `pending`, `rev = 1` | rule, hook |
| R-CAT-C-02 | M | **Another angler's** entry | Deny | rule |
| R-CAT-C-03 | M | Body includes `status = verified` | Deny | rule |
| R-CAT-C-04 | M | Body includes `judged_by` | Deny | rule |
| R-CAT-C-05 | M | Body includes `reason` or `flags` | Deny | rule |
| R-CAT-C-06 | M | Before `starts_at` | Deny | rule |
| R-CAT-C-07 | M | After `submit_deadline` | Deny | rule |
| R-CAT-C-08 | M | Event `draft`, `closed` or `final` | Deny | rule |
| R-CAT-C-09 | M | Species not in this tournament (walleye in E1) | Deny *(decided 2026-10-01)* | rule |
| R-CAT-C-10 | M | Same `client_uuid` sent twice | One record; second request fails | index |
| R-CAT-C-11 | anon | Submit | Deny | rule |
| R-CAT-C-12 | M | Weight event: `length_q` sent, or `weight_hoz` missing or ≤ 0 | Deny | rule |
| R-CAT-C-13 | M | Length event (EL): `weight_hoz` sent, or `length_q` missing or ≤ 0 | Deny | rule |
| R-CAT-C-14 | W | Submit to own withdrawn entry | Deny | rule |
| R-CAT-C-15 | M | Body sets `rev` | Deny | rule |
| R-CAT-C-16 | M | Photo over 5 MB, or not `image/jpeg` | Deny | schema, hook |
| R-CAT-C-17 | M | Submit during an outage extension (after `ends_at` + 24 h, before the extended `submit_deadline`) with a capture time after `ends_at` | Allow; flagged `after_window` (the fishing window never moves) | rule, hook |
| R-CAT-C-18 | K, S | Submit to own entry in E1 | Allow; `pending`, `rev = 1` (K's catch is then judged by S) | rule, hook |
| R-CAT-C-19 | M | `photo_captured_at` missing, with a different number of entries than files, or with a first entry different from `captured_at` | Deny | hook |
| R-CAT-C-20 | M | One fixture per create-time code: no capture time; before `starts_at`; after `ends_at`; more than 24 h before receipt; photo 2 with no capture time; photo 2 more than 24 h from photo 1; and a clean catch | Exactly the matching codes in `flags`; none on the clean catch | hook |
| R-CAT-C-21 | M | Create with one photo, or none | Deny | rule, hook |
| R-CAT-C-22 | M | Create with 4 photos where photo 3 is 30 h after photo 1 and photo 4 has no capture time | Allow; `extra_photo_far` and `extra_photo_no_time` set; no `photo_added` | hook |
| R-CAT-C-23 | M | Create body sets `created` | The stored `created` is the server receive time (the test asserts whether the pinned binary refuses or ignores the field) | schema |
| R-CAT-U-01 | K | Approve M's pending catch with current `rev` | Allow; `judged_by` = K; `approve` row | rule, hook |
| R-CAT-U-02 | K | Reject with a reason | Allow; `reject` row | rule, hook |
| R-CAT-U-03 | K | Reject without a reason | Deny | rule |
| R-CAT-U-04 | K | Correct M's pending catch's `weight_hoz` with a reason | Allow; `status = verified`; exactly one `correct` row, no `approve` row | rule, hook |
| R-CAT-U-05 | K | Correct without a reason | Deny | hook |
| R-CAT-U-06 | K | Approve own catch | Deny | rule |
| R-CAT-U-07 | S | Approve K's catch in E1 | Allow | rule |
| R-CAT-U-08 | S | Approve M's catch in E1 | Deny | rule |
| R-CAT-U-09 | S | Approve K's catch in E2 (not S's tournament) | Deny | rule |
| R-CAT-U-10 | M | Approve Y's catch | Deny | rule |
| R-CAT-U-11 | K | Re-judge: verified → rejected (with reason) in a live or closed event | Allow; audited | rule, hook |
| R-CAT-U-12 | K, S, M | Any change to a catch in EF | Deny | rule |
| R-CAT-U-13 | K | Approve with a stale `rev` (M edited since) | Deny | rule |
| R-CAT-U-14 | K | Set `status = pending` or any value other than verified/rejected | Deny | rule |
| R-CAT-U-15 | K | Body sets `judged_by`, `flags`, `entry`, `photo`, `captured_at` or `client_uuid` | Deny | rule |
| R-CAT-U-16 | M | Edit own pending catch's `weight_hoz` | Allow; `rev` + 1; `edit` row | rule, hook |
| R-CAT-U-17 | M | Edit own pending catch to a species not in the tournament | Deny | rule |
| R-CAT-U-18 | M | Edit own catch after it was judged | Deny | rule |
| R-CAT-U-19 | M | Edit own pending catch after `submit_deadline`, or in EC | Deny | rule |
| R-CAT-U-20 | M | Edit sets `status` to anything but `retracted`, sets `reason`, or sends a `rev` other than the stored one | Deny | rule |
| R-CAT-U-21 | M | Add a third photo to own pending catch, echoing the current `rev` | Allow; the first two kept in place; `photo_added` added; `rev` + 1; `edit` row | rule, hook |
| R-CAT-U-22 | M | Edit Y's catch | Deny | rule |
| R-CAT-U-23 | W | Edit own pending catch on a withdrawn entry | Deny | rule |
| R-CAT-U-24 | M | Edit sends `length_q` in a weight event | Deny | rule |
| R-CAT-U-25 | anon | Update any catch | Deny | rule |
| R-CAT-U-26 | M | Remove or replace an existing photo (`photo-`, or a full `photo` list missing the original) | Deny; no file deleted | hook |
| R-CAT-U-27 | M | Add a 5th photo, or a file over 5 MB or not `image/jpeg` | Deny | schema, hook |
| R-CAT-U-28 | M | Change `captured_at` | Deny | rule |
| R-CAT-U-29 | M | Retract own pending catch | Allow; hidden from others; never scores; `retract` row | rule, hook |
| R-CAT-U-30 | M | Retract own catch after it was judged, or after `submit_deadline` | Deny | rule |
| R-CAT-U-31 | K | Approve, reject or correct a retracted catch | Deny | rule |
| R-CAT-U-32 | M | Un-retract (retracted → pending) | Deny | rule |
| R-CAT-U-33 | K | Judge body includes `photo` | Deny | rule |
| R-CAT-U-34 | M | Add a photo whose capture time is 30 h after `captured_at` | Allow; `photo_added` and `extra_photo_far` added; earlier codes kept | hook |
| R-CAT-U-35 | M | Add a photo with no capture time | Allow; `photo_added` and `extra_photo_no_time` added | hook |
| R-CAT-U-36 | M | Change an existing `photo_captured_at` entry, or send a list whose length doesn't match the photos | Deny; no file deleted | hook |
| R-CAT-U-37 | K | Judge body includes `photo_captured_at` | Deny | rule |
| R-CAT-U-38 | K | Approve, reject or correct a flagged catch | Allow; `flags` unchanged | hook |
| R-CAT-U-39 | M | Edit, add a photo or retract without sending `rev`, or with a stale `rev` (e.g. a retried upload whose first attempt already landed) | Deny; no file added; no audit row | rule |
| R-CAT-U-40 | M | Two photo adds sent at the same moment with the same `rev` | Exactly one succeeds; one photo added; one `edit` row | hook |
| R-CAT-U-41 | K | Correct and reject in the same request | Deny | rule |
| R-CAT-U-42 | K | Change a judged catch's status (verified → rejected, or rejected → verified) without a reason | Deny | rule |
| R-CAT-U-43 | K | Re-approve M's rejected catch with a reason | Allow; `verified`; one `approve` row | rule, hook |
| R-CAT-U-44 | K | Correct `species` on M's rejected catch, and `length_q` on a pending catch in EL, each with a reason | Allow; both `verified`; one `correct` row each | rule, hook |
| R-CAT-U-45 | K | Update a decided catch sending only `reason` and the current `rev` (no `status`, species or measurement) | Deny | rule |
| R-CAT-U-46 | O | Approve M's pending catch in E1 (an organizer who isn't the judge) | Deny | rule |
| R-CAT-D-01 | M, K, S | Delete any catch | Deny | rule |

### audit_log

**List / view** (members read the history of any catch they can see; decided 2026-10-01)
```
@request.auth.id != "" &&
(@request.auth.role = "organizer" ||
 catch.entry.event.judge = @request.auth.id ||
 catch.entry.angler = @request.auth.id ||
 (catch.entry.event.backup_judge = @request.auth.id &&
  catch.entry.angler = catch.entry.event.judge) ||
 (catch != "" &&
  catch.status != "rejected" && catch.status != "retracted" &&
  catch.entry.withdrawn = false))
```
The last branch mirrors the first branch of the `catches` list rule, so a member reads every row of exactly the catches they can see, including earlier rejections, angler edits and corrections on a catch that is now pending or verified. A catch that is currently rejected or retracted, or on a withdrawn entry, keeps its rows hidden. Event and entry rows have no `catch`, so they match only the organizer branch. The judge branch (decided 2026-10-05) matters only for a judge without the organizer role, after a step-down: they read every row of the catches they judge, rejected ones included. **Create, update, delete:** `null`. Hooks write through `$app.save()`, which bypasses rules.

**Audit snapshots** (decided 2026-10-02). `before` and `after` always hold the same fixed set of fields for the row's kind, whatever changed; the app compares the two to show what changed. On a create or join row, `before` is empty.

| Row kind | Actions | Snapshot fields |
|---|---|---|
| Catch | create, edit, retract, approve, reject, correct | `species`, `weight_hoz`, `length_q`, `status`, `reason`, `photo` (filenames), `photo_captured_at`, `flags`, `rev` |
| Entry | join, withdraw, rejoin | `withdrawn`, `withdraw_reason`, `withdrawn_by` |
| Event | open, close, finalize, event_edit | Every `events` field |

Members read catch snapshots, flags included, on any catch they can see; entry and event rows stay organizer-only.

| ID | Who | Case | Expected | By |
|---|---|---|---|---|
| R-AUD-L-01 | anon | List audit rows | No records | rule |
| R-AUD-L-02 | M | List audit rows | Rows for M's own catches, plus every row for other anglers' catches that M can see (pending or verified, on non-withdrawn entries) | rule |
| R-AUD-L-03 | M | List audit rows | No event rows (open, close, finalize) and no entry rows | rule |
| R-AUD-L-04 | K | List audit rows | All | rule |
| R-AUD-L-05 | S | List audit rows in E1 | Rows for K's catches and S's own, plus the rows any member can see | rule |
| R-AUD-L-06 | M | List audit rows | No rows for Y's rejected or retracted catch, or for any catch on W's withdrawn entry | rule |
| R-AUD-L-07 | M | List audit rows for S's catch in E1 that K rejected and then re-approved | Every row present, including the `reject` row with its reason | rule |
| R-AUD-L-08 | S, after R-EVT-U-19 makes S the judge of E1 | List audit rows in E1 | Every row of every E1 catch S judges, rejected ones included | rule |
| R-AUD-L-09 | Y | List audit rows | Every row of own rejected and retracted catches | rule |
| R-AUD-C-01 | M, K | Create an audit row | Deny | rule |
| R-AUD-C-02 | S | Create an audit row | Deny | rule |
| R-AUD-U-01 | M, K | Update an audit row | Deny | rule |
| R-AUD-U-02 | S | Update an audit row on K's catch | Deny | rule |
| R-AUD-D-01 | M, K | Delete an audit row | Deny | rule |
| R-AUD-H-01 | — | Each allowed catch create, edit, approve, reject or correct | Exactly one row, with actor, `catch`, `event`, before and after (invariant 5) | hook |
| R-AUD-H-02 | — | Each join, withdraw or rejoin | Exactly one row | hook |
| R-AUD-H-03 | — | Each event status change or live-event edit | Exactly one row | hook |
| R-AUD-H-04 | — | A denied request | No row | rule |
| R-AUD-H-05 | — | Every row written by R-AUD-H-01 to H-03 | `before` and `after` hold exactly the snapshot fields for the row's kind; `before` is empty on create and join | hook |

### Sweeps (every collection)

Some collection × action × role cells have no row of their own above: views where the view rule is the list rule, anonymous writes, deletes by every role, and the backup judge outside `catches` and `audit_log`. Each sweep below loops over all six collections and the seeded records, so every cell has a test ID. A sweep failure names the collection, action and caller.

| ID | Who | Case | Expected | By |
|---|---|---|---|---|
| R-ALL-ANON-01 | anon | For every collection: view a seeded record by id, create, update and delete | Deny every request; no record and no audit row changes | rule |
| R-ALL-V-01 | anon, K, O, S, N, M, W, X, Y | For every collection and every seeded record: view by id | Found exactly when the record appears in that caller's list (view rule = list rule) | rule |
| R-ALL-D-01 | K, O, S, N, M, W, X, Y | Delete any seeded record in any collection | Deny; record still present | rule |
| R-ALL-S-01 | S, N | Every `R-USR`, `R-EVT`, `R-SPC` and `R-ENT` case that runs as an ordinary member, re-run as S and N on records that aren't their own | Same result as the member: backup judging grants nothing outside `catches` and `audit_log` | rule |

---

## Invariant coverage

| Invariant | Covered by |
|---|---|
| 1. Scores only from verified catches | `scoring.test.ts`; R-CAT-C-01 (new catches are pending) |
| 2. Server-only fields not settable on create | R-CAT-C-03 to 05, C-15, C-23; R-ENT-C-06; R-EVT-C-04, C-10, U-28 |
| 3. No self-judging; backup judge scope | R-CAT-U-06 to 09, U-46; R-EVT-U-18; R-ALL-S-01 |
| 4. No location data | R-CAT-C-16, U-21 plus the four photo fixture tests (photo spike) |
| 5. Every catch change audited | R-AUD-H-01, H-04, H-05 |
| 6. Nothing deleted through the API | Every `D` row; R-ALL-D-01; R-CAT-U-26, U-29 (retract keeps the record), U-36, U-39 |
| 7. Final is locked | R-CAT-U-12, R-ENT-U-10, R-EVT-U-05 |
| 8. Every read needs sign-in | Every `L-01` row, R-ALL-ANON-01, R-ALL-V-01, R-CAT-F-01, R-USR-A-01 |
| 9. Server receive time is authoritative | R-CAT-C-06, C-07, C-17, C-20, U-19, R-ENT-C-05; R-EVT-U-12 (the deadline moves, the window doesn't) |

## Access layout

Cloudflare Access decides **who reaches the server at all**; PocketBase's rules decide **what a signed-in member may do**. Either layer alone must hold: the rules matrix runs with Access absent, and Access must deny strangers even if a rule is wrong.

| Setting | Value | Why |
|---|---|---|
| Application | One self-hosted app on the whole hostname (`TODO.domain`), every path including `/api/*` and `/_/` | One door; nothing reachable around it |
| Allow policy | **Include: Emails**, an explicit list matching the PocketBase users | `Everyone`, or an email-domain rule, lets strangers in; Cloudflare lists both as misconfigurations |
| Service Auth policy | One service token, `uptime-probe`, used by the 5-minute probe and the `deploy.sh` smoke test | Machines get in without an email PIN; the token lives only in the prod LXC (`ops.md` §3) |
| Bypass policies | **None**, on any path of this hostname | Bypassed requests are not logged; a bypass on `/api/*` would expose the API to the internet |
| Login method | One-time PIN to email | No passwords to leak; same inbox as PocketBase OTP |
| Session duration | 7 days *(decided 2026-10-01; never under 24 h)* | Live-update reconnects mustn't fail silently mid-tournament; fewer PIN prompts over six weeks |
| Admin UI `/_/` | A second, path-specific Access app allowing only Kayden's email *(decided 2026-10-01)* | Members can't even reach the superuser login page; superuser MFA stays on as the second lock |
| Adding a member | Add to the Access list **and** have the superuser create the PocketBase user | Both lists must match (checked in the `ops.md` runbook) |
| Removing a member | Remove from the Access list; their PocketBase user and entries stay for history | Nothing is deleted; Access removal cuts them off at the edge |

**Access checks** (manual, recorded in `docs/evidence/m0.txt`, not in `rules.test.ts`):

| ID | Check | Expected |
|---|---|---|
| X-ACC-01 | Sign in with an email not on the list | Denied by Access |
| X-ACC-02 | `curl` the API with no Access cookie or token | Access login page or 403, never PocketBase |
| X-ACC-03 | Probe with the service token | 200 from PocketBase |
| X-ACC-04 | A member's browser opens `/_/` | Denied by the `/_/` Access app |
| X-ACC-05 | Leave a leaderboard open 15 minutes through the tunnel, then verify a catch | Appears within 5 s (M0 soak) |

## Threats, controls and tests

| # | Threat | Control | Evidence |
|---|---|---|---|
| T1 | A judge approves their own fish, or the backup judge acts outside their scope | `catches` update rule: not own entry; backup judge only on the judge's catches, only in that event; `judge` locked for the organizer once live | R-CAT-U-06 to 09, U-46; R-EVT-U-18 |
| T2 | An angler forges `status`, `judged_by`, `flags` or `rev` | Create and update rules reject those fields; hooks force server values | R-CAT-C-03 to 05, C-15, U-20 |
| T3 | Role escalation | `users` update rule: `role:changed = false`; no organizer path to change roles | R-USR-U-02, U-05 |
| T4 | Location leaks through a photo, including an added one | Strip before upload; server strip or fail closed on every create and append; archive check | R-CAT-C-16, U-21, photo fixtures, `archive-event.sh` check |
| T5 | Results changed after they're published (superuser, hook bug, shell access) | Final lock in rules and hooks; audit log has no update or delete; results and audit hashes posted to the group chat | R-CAT-U-12, R-AUD-U-01, D-01; hashes in the chat |
| T6 | Outsiders read the API or photos | Access on the whole hostname; every read requires sign-in; protected photos with short-lived tokens | X-ACC-01, 02; every `L-01`; R-CAT-F-01 |
| T7 | A judge approves a value that changed after they loaded it; a retried or doubled request applies twice | `rev` must match on every judge and angler action, re-checked inside the save | R-CAT-U-13, U-39, U-40 |
| T8 | A compromised app reaches the home network | Isolated VLAN, no inbound ports, PocketBase on localhost only | M0 firewall test (`ops.md` §2) |
| T9 | Uploads fill the disk | Client resize to 2560 px; 5 MB per file; `image/jpeg` only; at most 4 photos per catch; disk alert | R-CAT-C-16, U-27; `ops.md` §8 |
| T10 | The outage extension is used to let a late fish in | Extension only grows, only in whole hours, only while live, and only moves the deadline, never `ends_at`; every change is an `event_edit` row in the hashed audit CSV; outages are posted in the group chat | R-EVT-U-12 to 15, R-CAT-C-17 |
| T11 | A judge rewrites the recorded reason for a decision without changing the decision | Judge branch requires a status or a species or measurement change in the body | R-CAT-U-45 |

## Open items
1. ~~**Scoring group.**~~ Settled 2026-10-01: all species allowed in a tournament score as one group (`decisions.md`; `scoring.md` v0.4 §2 and example 7, group sign-off pending).
2. **Append-only photos need the photo spike to confirm** that a hook can compare the new `photo` list with the original before PocketBase deletes anything, on the pinned version. If it can't, the fallback is retract-and-resubmit only (R-CAT-U-21 becomes Deny, R-CAT-U-34 to U-36 and U-40 go with it, and `photo_added` is never set; the extra-photo checks still run at create).
3. ~~**Access session length and the admin-path app.**~~ Settled 2026-10-01 in `decisions.md`: 7 days, and a `/_/` app for Kayden's email only.
4. ~~**Outage extension mechanism.**~~ Settled 2026-10-01 in `decisions.md`: the field stays `deadline_ext_min` (minutes); the organizer enters the new total in whole hours (R-EVT-U-15).
5. ~~**`claude/features.json` doesn't cite the v0.5 to v0.8 test IDs yet** (R-EVT-C-07 to C-09, U-15 to U-17, R-ENT-L-06, R-CAT-C-19 to C-22, U-34 to U-44, R-AUD-L-06, L-07, H-05), and its S1 step for R-ENT-C-08 still says K joins E1, and its S3 audit-visibility step still says members see only their own rows.~~ Settled 2026-10-05: `claude/features.json` cites every test ID through v0.9.
6. ~~**Two required photos depend on `scoring.md` v0.5**, which the group hasn't agreed yet. If they don't, the create rule's `photo:length >= 2` clause and R-CAT-C-21 are dropped, and the extra-photo codes apply only from photo 2 onward when one is sent.~~ Settled 2026-10-03: the group agreed `scoring.md` v0.5.
7. **To confirm on the pinned binary (photo spike or the first rules test run):** that `judge.role` resolves against the submitted body in the events create rule (the hook checks it either way); that `@request.body.photo:length` counts uploaded files in a multipart create, and that the update hook can re-read `rev` inside the save transaction (R-CAT-U-40). If the second fails, photo adds need an idempotency key instead.
8. ~~**Fixture conflict (older rows):** the fixture table says X is "not joined to anything", but R-CAT-L-09, L-10, U-10, U-22 and R-AUD-L-06 use X's catches. Options: seed another ordinary angler with an E1 entry and use them in those rows, or seed X's catches after X joins E1 in R-ENT-C-01.~~ Settled in v0.9: fixture Y holds those catches, and the rows use Y.
