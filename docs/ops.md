# Ops: Fishing Scoreboard

**Status:** Skeleton v0.7, 7 Oct 2026. v0.7 applies the `decisions.md` rows of 2026-10-07: the staging container and the semi-automated pipeline (§1, §2, §3, §5, §8, §15; long entry L3), restic for offsite backups and the retention periods (§7), the patching policy (§6), the `deploy.sh` backup method (§5) and the sign-in values (§14, now the PocketBase auth settings). Open items moved to the one list in `decisions.md`. v0.6 (6 Oct) added the judge step-down procedure (§12), adding and removing a member with a name always set (§9), the dev VM and its VLAN (§1, §2), the Phase 2 setup status (§15), the sign-in values still to set (§14), and the 2026-10-05 runbook changes (Open checklist, code word changes while live, closed-event preview, share exports). v0.5 (1 Oct) synced the 7-day Access session, the `/_/` Access app, encrypted B2 offsite backups, change control and the outage rule. Filled in during Phase 2, completed and printed in Phase 4. `TODO` marks a value to fill in once it exists; *(proposed)* marks anything `decisions.md` hasn't confirmed yet.
**Printed copy:** keep one current printout with the break-glass sheet. Reprint after any change to sections 1–10 or 12.
**Never put a secret value in this file.** It records where secrets live, not what they are.

---

## 1. Inventory

| Thing | Where | Version / ID | Owner | Notes |
|---|---|---|---|---|
| Proxmox VE host | Homelab, UPS-backed | Installed 6 Oct 2026; version TODO | Kayden | Runs backups, encrypts and pushes them to B2, runs `archive-event.sh` |
| Prod container | Unprivileged Debian LXC, CT 110 (`site1`) | Debian TODO | Kayden | Own bridge `vmbr1`, 10.10.20.20/24, routed and filtered by the host (checks 10-14, 8 Oct 2026); no inbound ports |
| PocketBase | Prod LXC, `127.0.0.1:8090`, systemd unit `TODO` | Pinned in `POCKETBASE_VERSION`: v0.40.4 (released 12 Sep 2026), sha256 of the linux_amd64 zip checked against the release's `checksums.txt` | Kayden | Never run `./pocketbase update` on prod. Non-root user, `NoNewPrivileges`, `ProtectSystem=strict`, writes only to `pb_data` |
| cloudflared | Prod LXC | TODO | Kayden | Named tunnel `TODO`, created 6 Oct 2026; confirmed named and running inside the prod LXC (6 Oct). Never a Quick Tunnel (Quick Tunnels buffer SSE), never on the Proxmox host |
| Cloudflare Access app, whole hostname | Cloudflare Zero Trust | — | Kayden | Explicit email list; one-time PIN; 7-day session; Service Auth policy for the probe; no Bypass policies |
| Cloudflare Access app, `/_/` | Cloudflare Zero Trust | — | Kayden | Path-specific; allows only Kayden's email; superuser MFA stays on behind it |
| Domain / DNS | TODO registrar, DNS on Cloudflare | — | Kayden | Auto-renew **on** (TODO confirm) |
| GitHub repo | Private, `KaydenCouldBeBetter/ChromeFishingV2` | — | Kayden | Created 6 Oct 2026; GitHub Pro (Student Pack). Rulesets: `main` needs a pull request (no bypass); `v*` tags restricted, Repository admin bypass. The dev VM's deploy key also bypasses the tag ruleset, so CI and `deploy.sh` only accept tags on `main` (section 5). Required CI check added after M0-05 |
| Healthchecks.io | Checks `TODO`: prod probe (every 5 min); staging deploy (every timer run) | — | Kayden | Alerts to TODO (phone) |
| SMTP for PocketBase OTP | TODO provider | — | Kayden | Sender `TODO`; SPF and DKIM set on the domain so codes don't land in spam |
| Photo archive, copy 1 | Proxmox host, `TODO` path | — | Kayden | Written by `archive-event.sh`; pull-only account `TODO` for the other two copies |
| Photo archive, copy 2 | Desktop, `TODO` path | — | Kayden | Pulls and verifies the manifest; must verify before photos leave the app |
| Photo archive, copy 3 | Laptop, `TODO` path | — | Kayden | Pulls on the home LAN; full-disk encryption **on** (TODO confirm) |
| Offsite backups | Backblaze B2 bucket `TODO` (free tier, 10 GB) | restic (decided 2026-10-07), one repository in the bucket | Kayden | Encrypted by restic on the host before upload; the host holds the B2 key and the restic password, never a container. `restic check` weekly |
| Dev VM | Proxmox VM (not an LXC, so the Claude Code sandbox can start), own bridge `vmbr2`, 10.10.30.20/24; built 6 Oct 2026 | Debian 13; Node 24 LTS; Claude Code (native installer, stable channel) | Kayden | Claude Code with the sandbox on (`failIfUnavailable`); seed data only; no prod or staging credentials; `pre-push` hook from `.githooks/` runs `npm run check` |
| Staging container | Unprivileged Debian LXC, CT `TODO`, staging VLAN `TODO` | Same Debian, systemd unit, `deploy.sh` and pinned PocketBase as prod | Kayden | Decided 2026-10-07 (`decisions.md` L3). Seed data only, never prod data or photos; its own superuser. A systemd timer runs `deploy.sh --staging` every 5 min |
| cloudflared (staging) | Staging LXC | TODO | Kayden | Its own named tunnel to `staging.TODO` → `127.0.0.1:8090`, never shared with prod |
| Cloudflare Access app, staging hostname | Cloudflare Zero Trust | — | Kayden | Same email list and settings as prod (one-time PIN, 7-day session, no Bypass); Service Auth policy for the `staging-probe` token |

## 2. Network and firewall

| From | To | Port / proto | Allow? | Why |
|---|---|---|---|---|
| Prod LXC | Cloudflare edge | 7844 TCP/UDP, 443 | Allow | Outbound tunnel |
| Prod LXC | GitHub (`api.github.com`, release asset host) | 443 | Allow | `deploy.sh` downloads the bundle |
| Prod LXC | SMTP provider | TODO | Allow | OTP emails |
| Prod LXC | Healthchecks.io | 443 | Allow | Dead-man ping |
| Prod LXC | Debian mirrors | 80/443 | Allow | Security updates (policy in section 6) |
| Prod LXC | Backblaze B2 | any | **Deny** | Only the host pushes offsite; the container holds no B2 key |
| Prod LXC | Home LAN | any | **Deny** | Contain a compromised app |
| Prod LXC | Proxmox management | any | **Deny** | Contain a compromised app |
| Anything | Prod LXC | any inbound | **Deny** | Tunnel only |
| Proxmox host | Prod LXC | `pct exec` (no network) | Allow | Backups, archive script |
| Proxmox host | Backblaze B2 | 443 | Allow | Encrypted offsite push |
| Desktop | Proxmox host archive | SSH / rsync, read-only account | Allow | Desktop pulls the archive |
| Laptop | Proxmox host archive | SSH / rsync, read-only account, home LAN only | Allow | Laptop pulls the archive |
| Dev VM | Internet | 443 (plus what GitHub and npm need) | Allow | npm, GitHub, Claude Code |
| Dev VM | Prod VLAN | any | **Deny** | The agent never reaches production |
| Dev VM | Proxmox management | any | **Deny** | The agent never reaches the hypervisor |
| Dev VM | Home LAN | any | **Deny** | Contain the agent |
| Desktop | Dev VM | SSH | Allow | Kayden works in the dev VM |
| Staging LXC | Cloudflare edge | 7844 TCP/UDP, 443 | Allow | Staging tunnel |
| Staging LXC | GitHub (`api.github.com` and the Actions artifact download host it redirects to) | 443 | Allow | `deploy.sh --staging` finds and downloads the latest green `main` build |
| Staging LXC | SMTP provider, Healthchecks.io, Debian mirrors | as for prod | Allow | Sign-in codes on staging, deploy pings, security updates |
| Staging LXC | Backblaze B2, home LAN, Proxmox management, prod VLAN, dev VLAN | any | **Deny** | Staging is as contained as prod and can't reach either neighbour |
| Anything | Staging LXC | any inbound | **Deny** | Tunnel only |
| Dev VM, prod LXC | Staging VLAN | any | **Deny** | Nothing pushes into staging; it pulls |

**Check (M0 gate):** from the prod LXC, a connection to a LAN host and to the Proxmox UI both fail. From the dev VM, a connection to the prod LXC, the staging LXC and the Proxmox UI all fail. From the staging LXC, a connection to a LAN host, the Proxmox UI and the prod LXC all fail. Record output in `evidence/m0.txt`.

## 3. Secrets

| Secret | Lives in | Readable by | Rotate | Never on |
|---|---|---|---|---|
| PocketBase superuser password + MFA | Password manager | Kayden | Off-season | Dev VM, repo |
| Tunnel token | Prod LXC, root-only file `TODO` | root | Off-season | Dev VM, repo, Proxmox host |
| Access service token (probe, smoke test) | Prod LXC, root-only env file | root | Off-season | Dev VM, repo |
| GitHub release-read token (fine-grained, this repo only, contents read) | Prod LXC, root-only env file | root | Before expiry `TODO` | Dev VM, CI |
| SMTP credentials | PocketBase settings (in `pb_data`) | superuser | Off-season | Repo |
| Staging superuser password + MFA (not the prod one) | Password manager | Kayden | Off-season | Dev VM, repo, prod |
| Staging tunnel token | Staging LXC, root-only file `TODO` | root | Off-season | Prod LXC, dev VM, repo |
| Staging Access service token (`staging-probe`) | Staging LXC, root-only env file | root | Off-season | Prod LXC, dev VM, repo |
| GitHub staging token (fine-grained, this repo only, Actions read and Contents read) | Staging LXC, root-only env file | root | Before expiry `TODO` | Prod LXC, dev VM, CI |
| Staging SMTP credentials (separate from prod where the provider allows) | Staging PocketBase settings | staging superuser | Off-season | Repo |
| B2 application key (this bucket only) | Proxmox host only | root | Off-season | Prod LXC, dev VM |
| restic repository password (backup encryption) | Proxmox host, root-only file `TODO`; copy on the sealed break-glass sheet | root | Off-season (`restic key add` then `restic key remove` the old one) | Prod and staging LXCs, dev VM, B2 |
| GitHub deploy key, write, this repo only (`~/.ssh/chromie_deploy`, passphrase, no agent) | Dev VM only | Kayden | Off-season; remove it from the repo at once if the dev VM is compromised | Prod LXC, CI, any other machine |
| Desktop SSH key for archive pulls (read-only, archive folder only) | Desktop | Kayden | Off-season | Server, laptop |
| Laptop SSH key for archive pulls (separate key, same restrictions) | Laptop | Kayden | Off-season; revoke at once if the laptop is lost, and log it in section 12 | Server, desktop |

## 4. Accounts and recovery (bus factor)

- Second recovery contact on Cloudflare, GitHub, registrar, B2: TODO.
- Break-glass sheet holder (sealed): TODO. Contents: where this printout is, password manager emergency access, the backup encryption key, how to post "site down, keep your photos" to the group, how to fetch and decrypt the latest backup from B2.
- Handover plan before graduation: TODO.

## 5. Build, deploy and rollback

The pipeline is decided in `decisions.md` L3 (2026-10-07). Prod and staging both **pull**; nothing pushes into either. Prod runs only a bundle CI built on `main`, and only when Kayden runs `deploy.sh <tag>`.

**From change to prod**
1. **On the dev VM:** Claude Code finishes an item with `npm run check` green and commits on `item/<id>`. Kayden pushes; the `pre-push` hook runs `npm run check` again.
2. **Pull request:** CI runs the full job. Kayden reads every migration and rule diff and merges once it's green.
3. **Push to `main`:** CI runs again and uploads the bundle (`bundle.tar.gz`, its sha256 and `BUILD_INFO` with the commit) as a workflow artifact, kept 90 days.
4. **Staging (automatic, within 5 minutes):** the staging timer runs `deploy.sh --staging`, which deploys the newest green `main` build (below). A failed deploy rolls back and alerts through Healthchecks.
5. **Check on staging:** on your phone at `staging.TODO`, over mobile data. The app's build ID (from `BUILD_INFO`) shows which commit is running.
6. **Release:** tag the commit staging is running, on `main` (for example `v2027.05.1`, by drafting a release on GitHub). The release job attaches that commit's `main` build to the release; it fails if the commit has no green `main` build or isn't on `main`.
7. **Prod:** run `deploy.sh <tag>` (below) and append to section 13.

**`deploy.sh <tag>` on prod, in order:**
1. refuses if `/etc/scoreboard/FREEZE` exists (unless `--force`, logged in section 12);
2. refuses a tag whose commit isn't on `main` (GitHub compare API `main...<tag>` must be identical or behind; decided 2026-10-06), and if a tournament is `live` and the bundle adds migrations or changes `POCKETBASE_VERSION` (change control, decided 2026-10-01);
3. downloads the bundle and sha256 with the read-only token, verifies;
4. backs up by **stop, copy, start**: stops PocketBase and archives `pb_data` to `/var/backups/scoreboard/pre-deploy-<tag>-<time>.tar.zst` (decided 2026-10-07);
5. unpacks to `releases/<tag>`, verifies the PocketBase binary against `POCKETBASE_VERSION`;
6. switches the `current` symlink, starts the service;
7. smoke-tests through Cloudflare with the service token: the health endpoint (path recorded in M0-01) and the app's build ID;
8. appends a line to section 13.

**`deploy.sh --staging` on staging** (every 5 minutes from a systemd timer): asks GitHub for the newest successful `ci.yml` run on `main`; stops if that commit is already running; otherwise downloads its artifact with the staging token, verifies the sha256 and that the commit is on `main`, then does steps 4 to 7 with `releases/<sha>` and the `staging-probe` token. It skips the `FREEZE` and live-tournament checks (seed data only). It pings the Healthchecks staging check on success and its `/fail` URL on failure.

**If a smoke test fails:** `deploy.sh` switches `current` back to the previous release and restarts. If the failed release ran a migration that changed data, restore the backup from step 4.

**Before changing PocketBase itself:** `pct snapshot` on the host first.

## 6. Change control (decided 2026-10-01)

| Period | Allowed |
|---|---|
| Off-season / between tournaments | Anything through the normal pipeline |
| During a tournament window | Small tested fixes, backup first. No schema changes, no PocketBase upgrades (`deploy.sh` refuses both) |
| Last 3 days of the window → results final and post-finalize backup taken | Hard freeze: `FREEZE` file present. Only an event-blocking fix with `--force`, logged in section 12 |

This replaces the guide's T-7d freeze, which was written for one-day events.

**Patching** (decided 2026-10-07), prod and staging containers:
- `unattended-upgrades` applies **Debian security updates** daily, all year, with no automatic reboot.
- When you create `FREEZE`, also stop the apt timers: `systemctl stop apt-daily.timer apt-daily-upgrade.timer`. Start them again when you remove `FREEZE`. A critical fix during the freeze goes in by hand and gets a line in section 12.
- `cloudflared`, PocketBase (only through a new pin) and the Proxmox host are updated by hand, off-season or between tournaments, never during a freeze.

## 7. Backups and restore

| Backup | When | Kept | Where |
|---|---|---|---|
| vzdump (snapshot mode) + PocketBase ZIP | Nightly, TODO time | 14 days on the host; 30 days in B2 | Host; B2 (restic) |
| Pre-deploy (stop, copy, start) | Every `deploy.sh` run | Until the next good deploy | Prod LXC, `/var/backups/scoreboard/` |
| Before a judge step-down | Section 12 procedure | Until next season's post-finalize backup exists | Host |
| Start-of-tournament | When the event goes `live` | Until next season's post-finalize backup exists | Host; B2 (restic, tagged `tournament`) |
| Post-finalize | Right after `final`, before archiving photos | Until next season's post-finalize backup exists | Host; B2 (restic, tagged `tournament`) |

restic encrypts each backup on the host before it leaves the house, so Backblaze never holds readable photos or the database. Retention (decided 2026-10-07) is applied by the vzdump prune settings on the host and by `restic forget --keep-daily 30 --keep-tag tournament --prune` for B2; a `tournament` snapshot is forgotten by hand once next season's post-finalize backup exists. Photos are inside these backups, so **photo retention = backup retention**.

**Restore procedure** (works on any host: a fresh LXC or a VPS): TODO, written during the Phase 4 drill.
1. Create a fresh container on the isolated VLAN. TODO
2. Install the pinned PocketBase and the release bundle. TODO
3. Restore `pb_data` from the chosen backup. From B2: `restic restore` on the host with the repository password first. TODO
4. Start, point the tunnel at it, smoke-test. TODO

**Targets (SPEC):** service back within 12 h; within 24 h from offsite; at most 24 h of data lost (members re-enter from their camera roll). **M0 gate:** one backup reaches B2 and restores from it.

| Drill date | Source | Time to service | Notes / evidence file |
|---|---|---|---|
| TODO | | | `evidence/restore-YYYY-MM-DD.txt` |

## 8. Monitoring

- Cron in the prod LXC calls the public URL every 5 min with the Access service token; on 200 it pings Healthchecks. A missing ping covers home internet, cloudflared and PocketBase.
- The Healthchecks down and up alerts are the official outage times for the outage rule (`scoring.md` §6). Copy them into the outage log in section 12.
- Alerts reach: TODO (prove with a deliberate outage in M0).
- **Staging deploys:** every `deploy.sh --staging` run pings the staging check; a failed deploy pings `/fail`, and a timer that stops running goes silent. Either alerts Kayden. Prove it in M0 with one deliberately broken build.
- Disk alert at TODO % on the LXC volume (photos over six weeks).
- The leaderboard badge shows Live / Reconnecting / Updated h:mm; check it on a second device at tournament start. The badge appears only on the leaderboard, the judge queue and the Manage tournament counts; the event status chip (Draft, Live, Closed, Final) is a different thing.

## 9. Tournament runbook

**Any time: adding or removing a member** (`decisions.md` L1 §4; 2026-10-05 "No blank names on the board")
- [ ] Add their email to the whole-hostname Access app's email list.
- [ ] In the PocketBase admin UI, create their `users` record with that email, **a name (never blank: it's their board name)**, `role = member` and `display_units` (default `lb`). `emailVisibility` stays off. Tell them to sign in with the email code.
- [ ] Removing a member: take their email off the Access list. Their user, entries and catches stay for history; never delete them.
- [ ] Not tournament-time superuser work, so no section 12 line unless a tournament is live; during a tournament, log it in section 12 and tell the backup judge.

**Two weeks before the window**
- [ ] DEC permit: not pursued for now (`decisions.md` 2026-10-01). If that has changed, the permit must be applied for at least 45 days before the window opens.
- [ ] Create the event as `draft`: name, dates (Eastern time), metric, best 10, species, judge (you; must be an organizer), backup judge (a different person), code word on/off. The judge and backup judge are entered automatically; if the backup judge isn't fishing, they withdraw their own entry once the event is live.
- [ ] The Manage screen's Open checklist is all ticked: `starts_at` before `ends_at`, at least one species, a judge and a different backup judge, a code word if it's on. Open is refused otherwise.
- [ ] Access email list matches the member list; every member has a PocketBase user with a name.
- [ ] Restore drill done this season; last night's backup is in B2; monitor green; disk headroom TODO.
- [ ] Prod runs the release you mean to run all tournament, and staging showed it working on your phone first.

**Window opens**
- [ ] Start-of-tournament backup (host and B2). Open the event (draft → live).
- [ ] Post in the group chat: link, how to sign in, **tap Join on the tournament**, the two required photos, the 24-hour rule, "keep your photos in your camera roll", and that outages stretch the time limits.
- [ ] A few days in, check the entry count against who's fishing; nudge anyone who hasn't joined.
- [ ] Watch the board on a second device; badge shows Live.

**Weekly during the window**
- [ ] Queue cleared (the backup judge clears yours). Backups present on the host and in B2. Disk OK.

**Changing the code word while live** (`scoring.md` §5)
- [ ] Manage → Edit live tournament → new code word. The app keeps the previous word and the time of the change for the judges.
- [ ] Post the new word in the group chat straight away.

**After any outage** (section 10)
- [ ] Outage start, end and rounded length in the outage log (section 12); posted in the group chat.
- [ ] The judge excuses late flags on catches whose 24 hours overlapped it (`scoring.md` example 22).

**Removing someone from a tournament**
- [ ] Members withdraw themselves from the tournament page; nothing for you to do.
- [ ] To remove someone else: organizer screen → their entry → Withdraw, with a reason. Tell them directly.
- [ ] Don't delete the entry in the admin panel. If the app can't do it, that's a superuser action: log it in section 12 and tell the backup judge.

**If the judge has to step down:** section 12, "Judge step-down".

**Last 3 days**
- [ ] Create `FREEZE` and stop the apt timers (section 6). Remind the group of the final deadline (end + 24 h).

**Close and finalize**
- [ ] If an outage fell in the 24 hours after the window closed: while the event is still `live`, organizer screen → Extend deadline: enter the **new total** extension in whole hours, rounded up. The fishing window doesn't move. Post the new deadline in the group chat (`scoring.md` example 23).
- [ ] After `submit_deadline`: set event `closed`.
- [ ] Clear the queue; the backup judge clears your catches. If the backup judge can't, name a new one (only the backup judge can change once closed).
- [ ] Optional: build the results and audit CSV **previews** (marked "Preview, not final", no hash) and check them while judging can still fix things.
- [ ] Set event `final` (the "I've checked the standings" switch).
- [ ] Exports: build the results CSV and the audit CSV; share each file with its SHA-256 to the group chat (or download and copy the hash), and post the standings.
- [ ] Post-finalize backup (host and B2).
- [ ] Run `archive-event.sh <event_id>` on the host; desktop pulls and verifies; only then does the script remove photos from the app. Log in section 11.
- [ ] Laptop pulls and verifies on its next time on the home LAN; tick it in section 11.
- [ ] Remove `FREEZE` and start the apt timers again (section 6).

## 10. Site down

1. Is it just you? Check from mobile data, then the Healthchecks status.
2. Post in the group chat: "Scoreboard is down. Keep your photos; submit when it's back. The time limits stretch by the length of the outage." (`scoring.md` §6)
3. Home internet or power out → wait it out; note start and end times.
4. Container or PocketBase down → `pct status`, service logs, restart. Still down → restore (section 7).
5. Record the outage in the outage log (section 12), using the Healthchecks down and up times.
6. When it's back: post the outage times in the group chat. If the outage touched the 24 hours after the window closed, extend the final deadline before closing (section 9, Close and finalize).

## 11. Archive log

| Date | Event | Files | Manifest sha256 | Host copy | Desktop verified | Laptop verified | Removed from app |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

## 12. Superuser, break-glass and outage log

Kayden is organizer, judge and superuser, so the superuser account is the one control nobody else checks. **Every superuser action during a tournament gets a line here and a same-day message to the backup judge.** Superuser use is break-glass only (SPEC roles table).

| Date / time | Who | Action | Why | Backup judge told |
|---|---|---|---|---|
| | | | | |

### Judge step-down (decided 2026-10-05; `scoring.md` v0.6 §7, example 28)

Use this only when the judge can't carry on during a live or closed tournament. It is a superuser step, not an app screen.

1. **Pick the new backup judge.** Anyone except the person stepping up; they don't need the organizer role. They will judge only the new judge's own catches.
2. **Take a backup** (section 7, "Before a judge step-down").
3. **In the PocketBase admin UI (`/_/`), edit the event once:** set `judge` to the **current backup judge** and `backup_judge` to the new person, in the same save. The events hook allows a judge without the organizer role only on a superuser request that sets `judge` to the person who was the backup judge (R-EVT-U-19); any other non-organizer judge is refused.
4. **Check the result:**
   - the new backup judge has an entry in the tournament (the hook creates one with a `join` row; on a closed event it doesn't, and none is needed);
   - the former judge's entry is unchanged (they withdraw it if they aren't fishing);
   - exactly one `event_edit` audit row was written;
   - the new judge sees the queue for everyone else's catches, and the new backup judge sees the new judge's catches.
5. **Decisions already made stand**, with their original `judged_by`. Nobody re-judges them because of the change.
6. **Log it** in the table above, and **post it in the club group chat the same day**: who the judge and backup judge are now, and why.
7. **The organizer still closes and finalizes** the tournament, even if they are no longer the judge.

### Other superuser actions

| Need | Do | Never |
|---|---|---|
| A species name has a typo | Rename it in the admin UI; log it here | Delete it |
| A member's role must change (for example a second organizer) | Change `role` in the admin UI; log it | Change roles during a tournament without telling the backup judge |
| A member left the club | Take them off the Access list (section 9) | Delete their user, entries or catches |

**Outages** (times from Healthchecks; length rounded up to whole hours, `scoring.md` §6)

| Event | Down | Back up | Length (rounded) | Posted in chat | Final deadline extended? |
|---|---|---|---|---|---|
| | | | | | |

## 13. Deploy log

| Date | App tag | PocketBase version | Backup name | Smoke result | `--force`? |
|---|---|---|---|---|---|
| | | | | | |

## 14. PocketBase auth settings

Decided 2026-10-07 (`decisions.md`, "Sign-in values"). Set them in the `users` collection's auth options and the application settings on prod and staging, then confirm each one on v0.40.4 and record what you set.

| Setting | Value | Set and checked |
|---|---|---|
| Auth methods | OTP on; password and OAuth2 off | TODO |
| OTP code length | 8 digits | TODO |
| OTP validity | 10 minutes | TODO |
| "Send a new code" in the app | after 60 seconds | Built in S1 |
| Rate limit: OTP requests | TODO per client IP per minute (start at 3) | TODO |
| Rate limit: OTP sign-in attempts | TODO per client IP per minute (start at 5); note whether a code is invalidated after failed tries | TODO |
| Trusted proxy header | `CF-Connecting-IP`, so limits apply per person, not per Cloudflare edge | TODO |
| Auth token lifetime | 14 days; the app refreshes a valid token each time it opens | TODO |
| Superuser | MFA on; separate superuser on staging | TODO |

**Open items** for the whole project, ops ones included, are in one list at the bottom of `decisions.md`.

## 15. Setup status (Phase 2)

| Item | Status | Evidence / notes |
|---|---|---|
| Proxmox VE on the home server | Done 6 Oct 2026 | Version TODO in section 1 |
| Cloudflare tunnel | Done 6 Oct 2026 | Named tunnel; `cloudflared` runs inside the prod LXC (confirmed 6 Oct) |
| Domain on Cloudflare DNS | TODO | |
| Dev VM on its own VLAN, sandbox proven | Done 6 Oct 2026 | Sandbox probes refused (`touch ~/sandbox-probe`: read-only; `curl --noproxy`: can't resolve). `failIfUnavailable` stopped Claude Code until bubblewrap was installed. `docs/evidence/m0.txt` | `touch ~/sandbox-probe` refused; `curl --noproxy '*'` can't resolve |
| Private repo, rulesets, guardrails installed | Done 6 Oct 2026 | Direct push to `main` refused (GH013); tag test showed the deploy-key bypass (section 1); Claude Code refused an edit to `.claude/settings.json`, a shell append to it and `git push origin main`; the guard hook blocks when run by hand. `docs/evidence/m0.txt` |
| Prod LXC, prod VLAN and firewall | Done 8 Oct 2026 for prod and the dev VM | CT 110 on `vmbr1`; checks 10-14 in `evidence/m0.txt`; staging still to test |
| Access apps (whole hostname, `/_/`), service token | TODO | X-ACC-01 to 04 in `evidence/m0.txt` |
| SMTP and PocketBase auth settings | TODO | Section 14 |
| First deploy of a tag | TODO | Section 13 |
| B2 bucket, encrypted push, restore | TODO | `evidence/m0.txt` |
| Healthchecks probe and phone alert | TODO | Deliberate outage in `evidence/m0.txt` |
| 15-minute soak (X-ACC-05) | TODO | `evidence/m0.txt` |
| Staging LXC, staging VLAN, tunnel, Access app and `staging-probe` token | TODO | Section 2 check in `evidence/m0.txt` |
| Staging timer: first automatic deploy, and one deliberately failed build alerting the phone | TODO | `evidence/m0.txt` |
| `pre-push` hook installed (`git config core.hooksPath .githooks`) | TODO | |
