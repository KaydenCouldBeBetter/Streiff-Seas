# Scoring rules: Streiff Seas

**Status:** v0.6.1, **in force from 5 Oct 2026**. Kayden decides rule changes and posts them in the club group chat; a group vote is no longer needed (`decisions.md` 2026-10-05, "Rule changes no longer wait for a group vote").
**In force since:** 5 October 2026 (v0.6.1; v0.6 the same day). Earlier versions: v0.5 agreed by the group 3 October 2026, v0.4 on 1 October 2026.

These rules are the source of truth for the app. Every worked example in section 11 becomes an automated test, so if a rule changes here, the tests change with it.

**Changed in v0.6.1:** wording only. Examples 12 and 18 now say the backup judge approves the **judge's** catches, as §7 has said since v0.6; they are marked **[changed v0.6.1]**. No rule changed.

**Changed in v0.6:** every rule that changed since v0.5 is marked **[changed v0.6]** or **[new v0.6]** and listed in this table.

| Where | Change | Decided in `decisions.md` |
|---|---|---|
| §5, §7 | The organizer can change the code word during a tournament. A catch must show the word that was in effect when its first photo was taken; if that's unclear (no capture time, or the word changed within 24 hours of the photo), the judge sees both words and decides | 2026-10-03, which code word a catch must show |
| §7 | The judge can't be changed during a tournament except by stepping down. The backup judge then becomes the judge (they don't have to be an organizer), and a new backup judge is named for the new judge's own catches. Decisions already made stand | 2026-10-03, live-event edits; 2026-10-05, judge step-down details |
| §7, §12 | The backup judge approves the **judge's** own catches (until now: the organizer's); the organizer, not the judge, finalizes | 2026-10-05, judge step-down details |
| §11 | Examples 27 and 28 added | — |

**Agreed in v0.5** (3 October 2026): every rule marked **[changed v0.5]** or **[new v0.5]**, listed below.

| Where | Change | Decided in `decisions.md` |
|---|---|---|
| §5 | Every catch needs **two photos**: you holding the fish, and the fish on the scale (or board). The app has a slot for each and won't send without both. Up to 2 more photos allowed (4 in total) | 2026-10-02, two required proof photos |
| §5 | Every photo after the first is checked against the first photo's capture time; a missing time, or one more than 24 hours apart, is flagged (never refused) | 2026-10-02, extra-photo checks |
| §5, §7 | When the code word is on, it can appear in either of the two required photos | 2026-10-02, code word with two photos |
| §3, §7 | The judge is the organizer, chosen when the tournament is created; the judge and backup judge are entered in the tournament automatically | 2026-10-02, judge must be an organizer; automatic entries |
| §7 | The judge checks both required photos; a correction approves the catch at the corrected reading in one step | 2026-10-02, correct leaves the catch verified |
| §7 | Every member can read the history of any catch they can see (who submitted, edited, approved, rejected or corrected it, and why) | 2026-10-01, public catch history |
| §9 | Photos show the angler; every signed-in member sees them, like any catch photo | 2026-10-02, two required proof photos |
| §11 | Examples 13 and 15 reworded; examples 24 to 26 added | — |

**Previously agreed in v0.4** (1 October 2026), still marked **[changed v0.4]** or **[new v0.4]** below: the scoring group (§2), joining and withdrawing (§3), up to 4 append-only photos (§5), editing and retracting (§6), the outage rule (§6), re-judging (§7), rejected and retracted catches hidden (§7, §9), photo visibility and the three-place archive (§9), name sync (§9), and examples 7 and 19 to 23.

## 1. Format

- A tournament runs over a set window with a start and end date and time. The last one ran about six weeks.
- Each tournament is scored by **weight** (the default) or by **length**. The choice is made when the tournament is created, and the two are never mixed in one total.
- An angler's score is the **sum of their 10 best verified fish** in the window. Fewer than 10 is fine: the score is the sum of what they have.
- When an 11th or later fish is verified and beats an angler's smallest counted fish, it replaces that fish automatically (a "cull").
- There is **no minimum size**.
- Only **verified** catches count. Pending catches show on the leaderboard marked as pending but add nothing to the score. **Rejected and retracted catches never count**, and aren't shown as pending. **[changed v0.4]**

## 2. Eligible fish

- **Each tournament lists its allowed species when it is created. All species allowed in a tournament score together as one group.** Each catch is tagged with its species. **[changed v0.4]**
  - The first tournament allows **largemouth and smallmouth bass**, so it scores as one black bass group, as before.
  - A later tournament could allow walleye, or walleye alongside bass. Whatever is allowed scores as one group in that tournament.
  - The species list can't change once the tournament is live.
- **Species not allowed in the tournament can't be submitted.** The app offers only the tournament's species, and the server refuses any other. The judge never has to reject a fish for its species. **[changed v0.4]**
- The fish must be caught by the angler during the tournament window, legally under current NYSDEC regulations.
- **Any water counts**, as long as fishing there is legal.
- Fish **may be kept or released**. Either way, the proof photos must be taken at the moment of the catch (section 5).

## 3. Joining and withdrawing **[new v0.4]**

- **Members join a tournament themselves** with the Join button on the tournament page. Each member has one entry per tournament.
- **The judge and backup judge are entered automatically** when the tournament is created, so they don't need to tap Join. If they aren't fishing, they withdraw like anyone else; an entry with no catches never shows on the board. **[new v0.5]**
- Joining is open while the tournament is live, up to the final submission deadline.
- **Withdrawing** takes an angler off the leaderboard and out of the standings. Their entry and catches are **kept on record**, never deleted, and no new catches can be submitted to a withdrawn entry.
  - An angler can withdraw themselves at any time before results are final, and rejoin while joining is still open.
  - The organizer can withdraw anyone, with a reason when it's someone else, or reinstate them. An angler can't undo a withdrawal made by the organizer.
- Catches already waiting for the judge are still judged after a withdrawal, so nothing is left pending at the end.
- Nothing about entries changes once results are final.

## 4. Measuring and recording

**Weight tournaments**

- The fish is on the scale, and the scale's readout is legible in the same photo as the fish (the second required photo, section 5).
- Record the weight **exactly as the scale shows it**, in decimal pounds (3.43 lb) or in pounds and ounces (3 lb 7 oz). There is no rounding.

**Length tournaments**

- The fish lies on a measuring board with its mouth closed and touching the zero end.
- Lengths are **rounded down to the quarter inch**. Example: 17 5/8 in is recorded as **17 1/2 in**.

**Display units (a setting each member controls)**

- Each member chooses how weights appear on their own screen: **decimal pounds** (3.44 lb) or **pounds and ounces** (3 lb 7.0 oz). They can switch at any time in their settings.
- A catch can be entered in either format, whatever the scale shows. The entry screen offers both.
- The setting changes only what that member sees. It never changes anyone's score or ranking.
- Displayed weights are rounded: decimal pounds to 0.01 lb, and ounces to 0.1 oz. So a column of displayed weights can differ from the displayed total by 0.01 lb or 0.1 oz. The scoring itself uses exact values.

**Storage.** The app stores whole numbers only, so scoring never uses decimals and a tie is never a rounding accident.

- **Weights** are stored in **hundredths of an ounce**. This unit holds both scale formats exactly: 3 lb 7 oz = 5,500 and 3.43 lb = 5,488.
- **Lengths** are stored in **quarter-inches**: 17 1/2 in = 70.

## 5. Proof photos

- Every catch needs **two photos**, both **taken at the moment of the catch**, before the fish is kept or released: **[changed v0.5]**
  1. **You holding the fish**, with the whole fish in view; and
  2. **The fish on the scale** with the readout legible (weight tournaments), or **on the measuring board** with its mouth closed at the zero end and the reading legible (length tournaments).
- The submit screen has a labelled slot for each of the two, and **the app won't send a catch without both**. **[new v0.5]**
- **More photos.** Up to **2 more photos** are allowed, **4 in total**: at submission, or added later while the catch is pending (for example a clearer shot of the readout). Photos **can't be removed or replaced**, so the first two always stay the required ones. A photo added after submission flags the catch for the judge ("photo added after submission"). **[changed v0.5]**
- **Code word.** This is an optional setting for each tournament, and it is **off by default**. When it's on, a code word written on a card must be visible in **either of the two required photos** (holding the fish, or on the scale or board), and the app shows the current word on the submit screen. **[changed v0.5]**
  - The organizer **can change the word during the tournament**, for example if it leaks. A catch must show the word that was **in effect when its first photo was taken**. If that photo has no capture time, or the word changed within 24 hours of it, the judge sees both words and decides. **[new v0.6]**
- **Capture time.** When a photo is uploaded, the app reads its capture time and then strips all other metadata, including location. Location is never stored.

The capture time is only a signal, because it is easy to edit and often missing (for example, photos taken with the browser's camera button, screenshots or forwarded photos). A catch is **flagged for review**, never rejected automatically, when:

- the first photo's capture time is missing;
- the first photo's capture time is before the tournament starts or after it ends;
- the first photo's capture time is more than 24 hours before the submission; or
- any other photo's capture time is missing, or more than 24 hours from the first photo's. **[new v0.5]**

## 6. Submitting

- Catches are submitted in the app. One catch per submission: one fish, with its photos (section 5).
- The angler picks the species from the tournament's list and enters the weight (or length). The judge checks them against the photos.
- **Editing.** While a catch is pending, the angler can correct its species and weight (or length), until the judge rules on it or the final deadline passes. Every edit is recorded in the audit log. **[changed v0.4]**
- **Retracting.** Instead of deleting a catch, an angler can **retract** their own pending catch, for example to start again with a better photo. A retracted catch never scores, disappears for everyone except the angler and the judges, stays on record, and can't be un-retracted. The angler then submits a new catch. **[changed v0.4]**
- **After a rejection**, resubmitting means submitting a new catch. If the rejection came late, the resubmission may be flagged as more than 24 hours after the catch; **the judge decides case by case** whether to excuse that flag. **[changed v0.4]**
- Submit within **24 hours** of catching the fish. A late submission is flagged, and the judge rejects it unless there's a good reason.
- The final deadline is **24 hours after the window closes**, so a last-day catch can still be entered.

**Outages** **[new v0.4]**

If the app is down, the time limits stretch by the length of the outage. The fishing window itself never moves.

- **The 24-hour rule.** If an outage falls within the 24 hours after a catch, the angler has 24 hours plus the outage length to submit it. The judge excuses the late flag on that basis.
- **The final deadline.** If an outage falls within the 24 hours after the window closes, the organizer extends the final deadline by the outage length. Fish caught after the window closed still don't count.
- **What counts as an outage:** the app was unreachable for members, as recorded by the uptime monitor in the outage log, rounded up to the next whole hour. One angler's poor signal isn't an outage; their photo waits in the camera roll and the 24-hour rule covers it.
- The organizer posts each outage, with its start and end, in the club group chat.

## 7. Judging

- **Judge:** the organizer, chosen when the tournament is created. Only someone with the organizer role can be chosen. **[changed v0.5]**
- **Backup judge:** assigned for each tournament when it is created, so the role can change from one tournament to the next. Sam is the backup judge for the first tournament. The backup judge approves only the judge's own catches. **[changed v0.6]**
- **If the judge steps down.** The judge can't be changed during a tournament except by stepping down. The backup judge then becomes the judge for the rest of the tournament (they don't have to be an organizer), and a new backup judge is named to approve the new judge's own catches. Decisions already made stand. The site admin makes the change, logs it, and posts it in the club group chat the same day. The organizer still closes and finalizes the tournament. **[new v0.6]**
- **No one approves their own catch.** The app enforces this.
- For each catch, the judge checks that:
  - the two required photos show the angler holding the fish and the same fish on the scale or board **[changed v0.5]**;
  - the species tag matches the fish in the photos **[changed v0.4]**;
  - the readout or board is legible and matches the entry;
  - the code word in effect when the first photo was taken is visible in one of the two required photos, if the code word is turned on for that tournament **[changed v0.6]**; and
  - any flag is explained.
- If the entered number (or species) doesn't match the photos, the judge **corrects it to the photo's reading** instead of rejecting the catch. A correction **approves the catch at the corrected value in one step**, and needs a reason. **[changed v0.5]**
- A **rejection must include a reason**, and the angler can see it. Other members don't see rejected catches. **[changed v0.4]**
- **The judge can change a decision** (approve a rejected catch, reject an approved one, or correct an entry again) until results are final. Each change needs a reason. **[changed v0.4]**
- The judge always rules on the latest version of a catch. If the angler edits it while the judge has it open, the judge's decision is refused and the catch reloads. **[new v0.4]**
- Every approval, rejection, correction and change is recorded in the audit log with who made it, when, and the before and after values. **Every signed-in member can read the history of any catch they can see**, including a rejection that was later overturned and why. A catch that is currently rejected or retracted stays hidden from other members, with its history. **[changed v0.5]**
- Questions about a decision go to the judge before the tournament is finalized. Once it is finalized, results are final.

## 8. Ties

1. Equal totals are broken by comparing each angler's **biggest counted fish**.
2. If those are equal, compare the **second biggest**, then the third, and so on through the counted fish.
3. An angler who has a fish at a position where the other angler has none wins that comparison.
4. If the anglers are still tied after every fish, they **share the place**. The next place is skipped, so two anglers in 2nd are followed by 4th.

## 9. Leaderboard and photos

- The leaderboard is visible to **signed-in members only**.
- An angler appears on the board once they have at least one pending or verified catch. Withdrawn anglers don't appear. **[changed v0.4]**
- Each row shows:
  - the angler's total;
  - the number of counted fish;
  - their biggest fish; and
  - the number of pending catches.
- Weights appear in each viewer's chosen display units.
- **Names.** The board shows each member's current name. If a member changes their name, the board follows, until results are final; final results keep the name they were published with. **[new v0.4]**
- **Photos.** During the tournament, **every signed-in member can see every angler's catch photos**, except for rejected and retracted catches, which only the angler and the judges see. **[changed v0.4]** Since one required photo shows the angler holding the fish, members' faces are in those photos too. **[new v0.5]**
- Photos stay in the app **until the tournament is finalized**. They are then archived in **three places** (the organizer's server, desktop and laptop) and removed from the app, which then shows "Photo archived". **[changed v0.4]**

## 10. Awards (later)

- **Most impressive catch:** a community vote among members after the tournament ends. It is a separate award, not a tie-breaker, and it's a later feature.

## 11. Worked examples

These are weight tournaments unless stated otherwise. Weights are decimal-pound scale readings unless shown in pounds and ounces. All catches are verified unless marked pending, and every catch has both required photos unless stated otherwise.

| # | Situation | Result |
|---|---|---|
| 1 | Angler A has 12 fish: 2.10, 3.45, 1.20, 4.02, 2.88, 1.75, 3.10, 2.40, 0.95, 1.60, 2.05, 3.80 | The best 10 count: 4.02, 3.80, 3.45, 3.10, 2.88, 2.40, 2.10, 2.05, 1.75, 1.60. **Total 27.15 lb.** The 1.20 and 0.95 don't count. |
| 2 | A's 13th fish, 2.50, is verified | It culls the 1.60. **Total 28.05.** |
| 3 | A submits a 6.00 fish that is still pending | The board shows 28.05 and "1 pending". Once the fish is verified, it culls the 1.75: **total 32.30.** |
| 4 | Angler B has only 4 fish: 5.10, 4.80, 3.95, 2.20 | **Total 16.05** from 4 counted fish. There is no penalty for having fewer than 10. |
| 5 | One scale shows 3 lb 7 oz; another shows 3.43 lb; a third shows 2 lb 15.5 oz | Stored exactly as **5,500**, **5,488** and **4,750**. The 3 lb 7 oz fish is heavier by 0.12 oz. In decimal view they show as 3.44, 3.43 and 2.97. In pounds-and-ounces view they show as 3 lb 7.0 oz, 3 lb 6.9 oz and 2 lb 15.5 oz. |
| 6 | Length tournament: one board reads 17 5/8 in; another reads 14 7/8 in | Recorded as **17 1/2 in** (70) and **14 3/4 in** (59). Both are rounded down. |
| 7 **[changed v0.4]** | A tournament allows largemouth and smallmouth. An angler submits a smallmouth of 3.10 and a largemouth of 3.10, and also catches a 5.00 walleye | Both bass count, in one group, tagged by species. Walleye **isn't offered** on the submit screen, and the server refuses it if it's sent anyway, so it never reaches the judge. In a later tournament that allows walleye, largemouth and smallmouth, all three would score together as one group. |
| 8 | C: 4.50, 4.00, 3.50, 3.00, 2.50, 2.50 = 20.00. D: 4.20, 4.20, 3.80, 3.30, 2.50, 2.00 = 20.00 | The totals tie. The biggest fish are 4.50 vs 4.20, so **C ranks ahead.** |
| 9 | E: 4.50, 3.90, 3.60 = 12.00. F: 4.50, 4.10, 3.40 = 12.00 | The biggest fish tie at 4.50. The second biggest are 4.10 vs 3.90, so **F ranks ahead.** |
| 10 | G: 5.00, 4.00, 3.00 = 12.00. H: 5.00, 4.00, 2.00, 1.00 = 12.00 | The first two fish tie. The third are 3.00 vs 2.00, so **G ranks ahead**, despite having fewer fish. |
| 11 | K: 9.00. I: 3.00, 2.00. J: 2.00, 3.00. L: 4.00 | I and J tie on every fish. Places: **K 1st, I and J share 2nd, L 4th.** |
| 12 **[changed v0.6.1]** | The judge submits a 4.10 | The judge can't approve it. **The backup judge approves it.** |
| 13 **[changed v0.5]** | Both photos have no capture time (taken with the browser camera), but they clearly show the angler holding the fish and the same fish on the scale | The catch is **flagged**. The judge reviews it and approves it. |
| 14 | A photo's capture time is 3 days before the window opens | The catch is **flagged**. Unless the angler can show otherwise, the judge rejects it with the reason "caught before the tournament window." |
| 15 **[changed v0.5]** | The angler entered 4.73, but the scale readout shows 4.37 | The judge **corrects the entry to 4.37**, with a reason, and that **approves** the catch in the same step. The correction is logged as one entry, with the before and after values. |
| 16 | A member switches display units to pounds and ounces | A's total from example 1 shows as **27 lb 2.4 oz** instead of 27.15 lb. Every score and ranking stays the same. |
| 17 | A photo's capture time is Saturday 7:00 am, and the catch is submitted Sunday 9:30 am (26.5 hours later) | The catch is **flagged**. Unless there's a good reason, the judge rejects it: "submitted more than 24 hours after the catch." |
| 18 **[changed v0.6.1]** | A new tournament is created with a different member as backup judge | That member approves only the judge's catches, in this tournament only. Sam has no judging rights in it unless assigned again. |
| 19 **[new v0.4]** | Standings: Q 15.20, P 12.40, R 9.80. P withdraws (or the organizer withdraws P, with a reason). P also has one catch pending | P is **left out of the standings**: **Q 1st, R 2nd.** P's catches stay on record, and the judge still rules on P's pending catch, but nothing P has scores while withdrawn. If P withdrew themselves and rejoins while joining is open, P's verified fish count again. |
| 20 **[new v0.4]** | A submits a 3.90 with a blurry photo, retracts it while it's pending, and submits a new catch of the same fish with a clear photo | The retracted catch **never scores**, isn't counted as pending, and other members don't see it. The board shows "1 pending" (the new catch), and only the new catch is judged. The retracted catch can't be approved or brought back. |
| 21 **[new v0.4]** | After example 2 (A on 28.05), the judge looks again at A's verified 2.05 fish: the readout shows 1.05. The event is still live | The judge **corrects it to 1.05**, with a reason. It drops out of A's best 10 and the 1.60 comes back: counted 4.02, 3.80, 3.45, 3.10, 2.88, 2.50, 2.40, 2.10, 1.75, 1.60, **total 27.60.** The audit log shows the before and after, and A can read it. Once the event is final, no correction is possible. |
| 22 **[new v0.4]** | A fish is photographed Saturday 6:00 am. The app is down Saturday 10:00 am to 4:00 pm (6 hours, in the outage log). The catch is submitted Sunday 8:00 am, 26 hours after the catch | The catch is **flagged** as late, but the outage stretches the limit to 30 hours, so the judge **approves** it. |
| 23 **[new v0.4]** | The window closes Sunday 8:00 pm, so the final deadline is Monday 8:00 pm. The app is down Monday 8:00 to 10:20 am (2 h 20 min). An angler also submits a fish photographed Sunday 9:00 pm | The outage rounds up to 3 hours, and the organizer **extends the final deadline to Monday 11:00 pm**. The fishing window doesn't move: the Sunday 9:00 pm fish is **flagged** as after the window and rejected, "caught after the tournament window." |
| 24 **[new v0.5]** | An angler has only the scale photo and tries to submit | The app **won't send it** until the "holding the fish" photo is added, and the server refuses a catch with fewer than two photos if one is sent anyway. It never reaches the judge. |
| 25 **[new v0.5]** | Photo 1 (holding the fish) was taken Saturday 7:00 am; photo 2 (on the scale) has a capture time of Sunday 2:00 pm, 31 hours later | The catch is **flagged**: the two photos are more than 24 hours apart. The judge checks they show the same fish and decides; if they don't match, the judge rejects it with a reason. |
| 26 **[new v0.5]** | The judge rejected A's 3.20 ("readout not legible"), then looks again at full size and can read it | The judge **re-approves it with a reason** ("readout legible at full size"). Every member who can see the catch reads both steps, with both reasons, in its history. |
| 27 **[new v0.6]** | The code word is OAK until Saturday 7:00 am, when the organizer changes it to MAPLE. Catch X: first photo Saturday 6:30 am, shows OAK, submitted at 9:00 am. Catch Y: first photo Saturday 8:00 am, shows OAK. Catch Z: first photo Monday 10:00 am, shows OAK | **X is fine**: OAK was in effect when the photo was taken, even though it was submitted after the change. **Y**: the word changed an hour before the photo, so the judge sees both words and decides (for example, accepts it if the change wasn't posted yet). **Z** shows the wrong word more than 24 hours after the change: the judge rejects it, "wrong code word," unless there's a good reason. |
| 28 **[new v0.6]** | Halfway through, the judge has to step down. Sam is the backup judge | The site admin makes **Sam the judge** and names a **new backup judge**, who approves only Sam's own catches. Sam judges every other pending catch from then on, including the former judge's. Decisions already made stand, and the history still shows who made them. The organizer still closes and finalizes. |

## 12. Glossary

| Term | Meaning |
|---|---|
| Tournament window | The start and end date and time during which fish count |
| Metric | Weight or length, set per tournament; weight is the default |
| Display units | Each member's choice to see weights in decimal pounds or pounds and ounces; it doesn't affect scoring |
| Counted fish | The angler's best 10 verified fish; only these make up the score |
| Cull | A new verified fish replacing the smallest counted fish |
| Pending / verified / rejected / retracted | Awaiting the judge / approved and counting / refused with a reason / taken back by the angler while pending; never counts **[changed v0.4]** |
| Judge / backup judge | The organizer (or, if the judge steps down, the former backup judge) / the member assigned for each tournament to approve only the judge's own catches **[changed v0.6]** |
| Proof photos | The two required photos of each catch: the angler holding the fish, and the fish on the scale or board; up to 2 more are allowed **[new v0.5]** |
| Code word | An optional word written on a card and visible in either required photo; off by default **[changed v0.5]** |
| Capture time | The time the phone recorded when the photo was taken; used only to flag catches |
| Flag | A marker telling the judge to look closely; never an automatic rejection |
| Correction | The judge changing the entered number or species to the photo's reading; it approves the catch **[changed v0.5]** |
| Finalize | The organizer locks the tournament; results can no longer change **[changed v0.6]** |
| Scoring group | All the species allowed in a tournament, scored together and tagged separately. For a bass tournament, the black bass group: largemouth and smallmouth **[changed v0.4]** |
| Entry | A member's place in one tournament, created when they tap Join **[new v0.4]** |
| Withdrawn | An entry taken out of the standings by the angler or the organizer; kept on record **[new v0.4]** |
| Retract | The angler taking back their own pending catch instead of deleting it **[new v0.4]** |
| Outage | Time the app was unreachable for members, from the uptime monitor's log; it stretches the time limits **[new v0.4]** |
| Hundredths of an ounce | The unit weights are stored in, which holds both scale formats exactly |

## 13. Next step

v0.4 was agreed 1 October 2026, v0.5 on 3 October 2026, and v0.6 is in force from 5 October 2026, with v0.6.1 (wording only) the same day. **To change a rule:** Kayden decides, posts the change in the club group chat, updates this page and its worked examples (which are the tests) together, bumps the version and re-dates the "In force since" line. A group vote isn't needed (`decisions.md` 2026-10-05); if a member objects to a change, put that change to the group before it takes effect. The code word stays off unless you turn it on when you create a tournament.
