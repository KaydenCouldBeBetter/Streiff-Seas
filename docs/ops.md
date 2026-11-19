# Ops: Streiff Seas

**Status:** Skeleton v0.9, 19 Nov 2026. v0.9 installs the waiting drafts (`docs/drafts/ops-md-m0-01.md`, `ops-md-m0-05b.md`, `ops-md-s4-archive.md`, `ops-md-demo-seed.md`): the `scoreboard` install layout and deploy secrets (§1, §3), the interim locally built bundle and what `deploy.sh` checks (§5), the health endpoint and build ID (§5), `archive-event.sh` in the close-and-finalize run (§9), and the grading demo data with its wipe (§12). It records the 2026-11-19 deploy of `a3d7ca9`, the wipe, the re-setup and the seed (§12, §13, §14, §15), with two lessons: `pct exec` needs full paths, and the Mail form's TLS must be **Always** (§5, §14). v0.8 (18 Nov) applies the M0-06 work so far (`decisions.md` 2026-11-18 "Open items 12 and 13 settled, 14 in part"; `evidence/m0.txt` checks 15 to 30): the network as built (§1, §2), the tunnel, Access apps and service token (§1, §3), SMTP through Resend (§1, §2, §3), the admin sign-in order and the first superuser (§9, §12), the auth settings set and checked on prod (§14) and the setup status (§15). v0.7 (7 Oct) applies the `decisions.md` rows of 2026-10-07: the staging container and the semi-automated pipeline (§1, §2, §3, §5, §8, §15; long entry L3), restic for offsite backups and the retention periods (§7), the patching policy (§6), the `deploy.sh` backup method (§5) and the sign-in values (§14, now the PocketBase auth settings). Open items moved to the one list in `decisions.md`. v0.6 (6 Oct) added the judge step-down procedure (§12), adding and removing a member with a name always set (§9), the dev VM and its VLAN (§1, §2), the Phase 2 setup status (§15), the sign-in values still to set (§14), and the 2026-10-05 runbook changes (Open checklist, code word changes while live, closed-event preview, share exports). v0.5 (1 Oct) synced the 7-day Access session, the `/_/` Access app, encrypted B2 offsite backups, change control and the outage rule. Filled in during Phase 2, completed and printed in Phase 4. `TODO` marks a value to fill in once it exists; *(proposed)* marks anything `decisions.md` hasn't confirmed yet.
**Printed copy:** keep one current printout with the break-glass sheet. Reprint after any change to sections 1–10 or 12.
**Never put a secret value in this file.** It records where secrets live, not what they are.

---

## 1. Inventory

| Thing | Where | Version / ID | Owner | Notes |
|---|---|---|---|---|
| Proxmox VE host | Homelab, UPS-backed | Installed 6 Oct 2026; version TODO | Kayden | Runs backups, encrypts and pushes them to B2, runs `archive-event.sh` (installed by hand as `/usr/local/sbin/archive-event`, never from a bundle; needs `sqlite3`, `exiftool` and `sha256sum`: `apt install sqlite3 libimage-exiftool-perl`). The desktop and laptop need only `bash` and `sha256sum` to run `archive-event.sh verify`; keep a copy of the script beside each archive |
| Prod container | Unprivileged Debian LXC, CT 110 (`site1`) | Debian TODO | Kayden | Own bridge `vmbr1` (a host-routed bridge, not a VLAN; `decisions.md` 2026-11-18), its own /24 (address not published), routed and filtered by the host (checks 10-14, 8 Oct 2026); no inbound ports. No `sshd` or Postfix: access is `pct exec` from the host |
| PocketBase | Prod LXC, `127.0.0.1:8090`, systemd unit `scoreboard.service` (user `scoreboard`) | Pinned in `POCKETBASE_VERSION`: v0.40.4 (released 12 Sep 2026), sha256 of the linux_amd64 zip checked against the release's `checksums.txt` | Kayden | Layout: `/opt/scoreboard/releases/<tag or sha>/` (pb_public, pb_hooks, pb_migrations, POCKETBASE_VERSION, BUILD_INFO, the pinned `pocketbase`), `/opt/scoreboard/current` → the running release, `/opt/scoreboard/pb_data/` (the only path the unit can write), `/opt/scoreboard/pb-cache/<version>/` (verified PocketBase zips). `/etc/scoreboard/`: `ENVIRONMENT` (`prod` or `staging`), `FREEZE` (only during a freeze), `deploy.env` (root, 0600). Pre-deploy backups in `/var/backups/scoreboard/`, deploy log in `/var/log/scoreboard/deploy.log`. Installed by hand, never from a bundle (reinstall when the script changes): `deploy.sh` as `/usr/local/sbin/scoreboard-deploy`; `wipe-demo` as `/usr/local/sbin/wipe-demo` until the wipe before tournament #1 (§12). `pct exec` runs without `/usr/local/sbin` on its `PATH`, so call them by full path (2026-11-19). Never run `./pocketbase update` on prod. Non-root user, `NoNewPrivileges`, `ProtectSystem=strict`, writes only to `pb_data` |
| cloudflared | Prod LXC | `2026.11.1` (2026.10.0 until the hand `apt upgrade` of 2026-11-18; unattended-upgrades takes Debian security updates only, so cloudflared moves only by hand, as section 6 wants) | Kayden | Named tunnel `streiffserver`, created 6 Oct 2026, route `streiffseas.com` → `http://127.0.0.1:8090`; confirmed named and running inside the prod LXC (6 Oct). `cloudflared.service` runs `tunnel run --no-autoupdate --token-file /etc/cloudflared/token` as root. Never a Quick Tunnel (Quick Tunnels buffer SSE), never on the Proxmox host |
| Cloudflare Access app, whole hostname | Cloudflare Zero Trust | — | Kayden | App `Scoreboard` on `streiffseas.com`, team `streiffseas.cloudflareaccess.com` (Zero Trust Free, 50 seats; the admin app's sign-in page showed team `black-dust-5b45.cloudflareaccess.com` on 2026-11-19: TODO confirm which is current). Policies: `Members` (Allow, Email List `club-members`) and `Uptime probe` (Service Auth, Service Token `uptime-probe` only, never 'Any Access Service Token'). One-time PIN only, instant auth, 1-week session, no Bypass |
| Cloudflare Access app, `/_/` | Cloudflare Zero Trust | — | Kayden | App `Scoreboard admin` on `streiffseas.com/_/`. Policy `Kayden only` (Allow, Kayden's email). One-time PIN only, 24-hour session; superuser MFA stays on behind it. Its `/api/` calls go through the `Scoreboard` app, so Kayden's email is on `club-members` too |
| Domain / DNS | `streiffseas.com`, registered TODO (Cloudflare Registrar?) on 2026-11-17, DNS on Cloudflare | — | Kayden | Auto-renew **on** (TODO confirm); expires TODO |
| GitHub repo | Private, `KaydenCouldBeBetter/ChromeFishingV2` | — | Kayden | Created 6 Oct 2026; GitHub Pro (Student Pack). Rulesets: `main` needs a pull request (no bypass); `v*` tags restricted, Repository admin bypass. The dev VM's deploy key also bypasses the tag ruleset, so CI and `deploy.sh` only accept tags on `main` (section 5). Required CI check added after M0-05 |
| Healthchecks.io | Checks `TODO`: prod probe (every 5 min); staging deploy (every timer run) | — | Kayden | Alerts to TODO (phone) |
| SMTP for PocketBase OTP | Resend (free tier: 100 emails a day, 3,000 a month, reset at 00:00 UTC) | — | Kayden | Sender `Streiff Seas <noreply@streiffseas.com>`, via `smtp.resend.com:465`, TLS always. Domain `streiffseas.com` verified in Resend: DKIM TXT `resend._domainkey`, SPF by the CNAMEs `send` and `rsend`, DMARC TXT `_dmarc` `p=none`; receiving off. Cloudflare Access PINs come from Cloudflare and don't count toward the quota. Staging will share the account and its daily quota (`evidence/m0.txt` checks 25, 26) |
| Photo archive, copy 1 | Proxmox host, `TODO` path | — | Kayden | Written by `archive-event.sh`; pull-only account `TODO` for the other two copies |
| Photo archive, copy 2 | Desktop, `TODO` path | — | Kayden | Pulls and verifies the manifest; must verify before photos leave the app |
| Photo archive, copy 3 | Laptop, `TODO` path | — | Kayden | Pulls on the home LAN; full-disk encryption **on** (TODO confirm) |
| Offsite backups | Backblaze B2 bucket `TODO` (free tier, 10 GB) | restic (decided 2026-10-07), one repository in the bucket | Kayden | Encrypted by restic on the host before upload; the host holds the B2 key and the restic password, never a container. `restic check` weekly |
| Dev VM | Proxmox VM (not an LXC, so the Claude Code sandbox can start), own bridge `vmbr2`, its own /24 (address not published); built 6 Oct 2026 | Debian 13; Node 24 LTS; Claude Code (native installer, stable channel) | Kayden | Claude Code with the sandbox on (`failIfUnavailable`); seed data only; no prod or staging credentials; `pre-push` hook from `.githooks/` runs `npm run check` |
| Staging container | Unprivileged Debian LXC, CT `TODO`, its own host-routed bridge `TODO` | Same Debian, systemd unit, `deploy.sh` and pinned PocketBase as prod; same layout, unit and `scoreboard-deploy`, plus `scoreboard-staging-deploy.service` and `.timer` | Kayden | Decided 2026-10-07 (`decisions.md` L3). Seed data only, never prod data or photos; its own superuser. A systemd timer runs `deploy.sh --staging` every 5 min |
| cloudflared (staging) | Staging LXC | TODO | Kayden | Its own named tunnel to `staging.streiffseas.com` → `127.0.0.1:8090`, never shared with prod |
| Cloudflare Access app, staging hostname | Cloudflare Zero Trust | — | Kayden | Same email list and settings as prod (one-time PIN, 7-day session, no Bypass); Service Auth policy for the `staging-probe` token |

## 2. Network and firewall

The containers sit on host-routed bridges (`vmbr1` prod, `vmbr2` dev VM, staging its own), not VLANs. "Home LAN" means the Proxmox host's Wi-Fi uplink (subnet and gateway not published). Outbound internet from prod and staging is **open** (`decisions.md` 2026-11-18): the Allow rows below list what each container needs, not a filter. The **Deny** rows are enforced by the host and checked for the M0 gate.

| From | To | Port / proto | Allow? | Why |
|---|---|---|---|---|
| Prod LXC | Cloudflare edge | 7844 TCP/UDP, 443 | Allow | Outbound tunnel |
| Prod LXC | GitHub (`api.github.com`, release asset host) | 443 | Allow | `deploy.sh` downloads the bundle |
| Prod LXC | SMTP provider (`smtp.resend.com`) | 465 | Allow | OTP emails |
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
| Tunnel token | Prod LXC, `/etc/cloudflared/token` (root, 0600) | root | Off-season | Dev VM, repo, Proxmox host |
| Access service token `uptime-probe` (probe, smoke test) | Prod LXC, root-only env file (`/etc/scoreboard/deploy.env`, for the smoke test); a copy on Kayden's Fedora desktop for the X-ACC checks. Cloudflare shows the secret only at creation, so those are the only copies; consider the password manager too | root; Kayden | Before expiry TODO (1 year from 2026-11-18) | Dev VM, repo |
| GitHub release-read token (fine-grained, this repo only, contents read) | Prod LXC, `/etc/scoreboard/deploy.env` (root, 0600) | root | Before expiry `TODO` | Dev VM, CI |
| SMTP credentials: a Resend API key, Sending access, limited to `streiffseas.com` | PocketBase Mail settings (in `pb_data`) | superuser | Off-season: make a new key in Resend, paste it into Mail settings, send a test email, then delete the old key | Repo |
| Staging superuser password + MFA (not the prod one) | Password manager | Kayden | Off-season | Dev VM, repo, prod |
| Staging tunnel token | Staging LXC, root-only file `TODO` | root | Off-season | Prod LXC, dev VM, repo |
| Staging Access service token (`staging-probe`) | Staging LXC, `/etc/scoreboard/deploy.env` (root, 0600) | root | Off-season | Prod LXC, dev VM, repo |
| GitHub staging token (fine-grained, this repo only, Actions read and Contents read) | Staging LXC, `/etc/scoreboard/deploy.env` (root, 0600) | root | Before expiry `TODO` | Prod LXC, dev VM, CI |
| Staging SMTP credentials: a separate Resend key, same restrictions, made when staging is built | Staging PocketBase settings | staging superuser | Off-season | Repo |
| B2 application key (this bucket only) | Proxmox host only | root | Off-season | Prod LXC, dev VM |
| restic repository password (backup encryption) | Proxmox host, root-only file `TODO`; copy on the sealed break-glass sheet | root | Off-season (`restic key add` then `restic key remove` the old one) | Prod and staging LXCs, dev VM, B2 |
| GitHub deploy key, write, this repo only (`~/.ssh/chromie_deploy`, passphrase, no agent) | Dev VM only | Kayden | Off-season; remove it from the repo at once if the dev VM is compromised | Prod LXC, CI, any other machine |
| Desktop SSH key for archive pulls (read-only, archive folder only) | Desktop | Kayden | Off-season | Server, laptop |
| Laptop SSH key for archive pulls (separate key, same restrictions) | Laptop | Kayden | Off-season; revoke at once if the laptop is lost, and log it in section 12 | Server, desktop |

`/etc/scoreboard/deploy.env` is read as `KEY=VALUE` lines, never sourced. Its key names are in `docs/drafts/deploy-env.example`: `GITHUB_REPO`, `GITHUB_TOKEN`, `SMOKE_URL`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, and `HEALTHCHECKS_URL` on staging only.

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
5. **Check on staging:** on your phone at `staging.streiffseas.com`, over mobile data. The app's build ID (from `BUILD_INFO`) shows which commit is running.
6. **Release:** tag the commit staging is running, on `main` (for example `v2027.05.1`, by drafting a release on GitHub). The release job attaches that commit's `main` build to the release; it fails if the commit has no green `main` build or isn't on `main`.
7. **Prod:** run `deploy.sh <tag>` (below) and append to section 13.

**`deploy.sh <tag>` on prod, in order:**
1. refuses if `/etc/scoreboard/FREEZE` exists (unless `--force`, logged in section 12);
2. refuses a tag whose commit isn't on `main` (GitHub compare API `main...<tag>` must be identical or behind; decided 2026-10-06), and if a tournament is `live` and the bundle adds migrations or changes `POCKETBASE_VERSION` (change control, decided 2026-10-01);
3. downloads the bundle and sha256 with the read-only token, verifies;
4. backs up by **stop, copy, start**: stops PocketBase and archives `pb_data` to `/var/backups/scoreboard/pre-deploy-<tag>-<time>.tar.zst` (decided 2026-10-07);
5. unpacks to `releases/<tag>`, verifies the PocketBase binary against `POCKETBASE_VERSION`;
6. switches the `current` symlink, starts the service;
7. smoke-tests through Cloudflare with the service token: the health endpoint and the app's build ID;
8. appends a line to section 13.

**Health endpoint on v0.40.4** (M0-01): `GET /api/health` returns `200` with `Content-Type: application/json` and the body `{"message":"API is healthy.","code":200,"data":{}}`. The smoke test checks the JSON body (`"code":200`), not only the status: with the index fallback on, any unknown path, `/api/` paths included, also answers `200` with `index.html`.
**Build ID:** `GET /build.json` returns `{"sha":"<40-character commit>","built_at":"<UTC ISO 8601>"}`; `sha` is `"dev"` for a build made outside CI or `make-bundle.sh`. The smoke test compares `sha` with the commit in `BUILD_INFO`; the app's footer shows its first 7 characters.
**Index fallback:** `pocketbase serve --indexFallback` is on by default on v0.40.4, so a refresh on a client route loads the app. The systemd unit still passes `--indexFallback=true` so a changed default can't break it silently. A missing asset under `/assets/` also gets `index.html` with `200`, never a `404`.

**`deploy.sh --staging` on staging** (every 5 minutes from a systemd timer): asks GitHub for the newest successful `ci.yml` run on `main`; stops if that commit is already running; otherwise downloads its artifact with the staging token, verifies the sha256 and that the commit is on `main`, then does steps 4 to 7 with `releases/<sha>` and the `staging-probe` token. It skips the `FREEZE` and live-tournament checks (seed data only). It pings the Healthchecks staging check on success and its `/fail` URL on failure.

**If a smoke test fails:** `deploy.sh` switches `current` back to the previous release and restarts. If the failed release ran a migration that changed data, restore the backup from step 4.

**Not built yet: CI.** GitHub Actions can't run yet (`decisions.md` 2026-11-17; Open item 21), so nothing builds bundles and steps 2–4 and 6 of "From change to prod" can't run. Until M0-05a is in, use the interim path below.

**Interim: a locally built bundle** (`decisions.md` 2026-11-17, interim row). Prod runs a bundle built on Kayden's machine, **not one CI tested**. Run on 2026-11-18 (`567acbb`) and 2026-11-19 (`a3d7ca9`), both straight to prod: there's no staging yet, so steps 2 and 3 were skipped.
1. On Kayden's machine, on `main` after the merge is pulled, with Node 24 (`nvm use`): `scripts/make-bundle.sh`. It refuses a dirty tree, a commit that isn't on `origin/main`, or another Node major, then runs `npm run check` and writes `bundles/<sha>/bundle.tar.gz` and `bundle.sha256`. Note the sha256 it prints.
2. Copy both files to the host (`scp -r bundles/<sha> root@<host>:/root/`), then into the staging container: `pct exec <staging CT> -- mkdir -m 700 /root/bundle`, then `pct push <staging CT> /root/<sha>/bundle.tar.gz /root/bundle/bundle.tar.gz` and the same for `bundle.sha256`.
3. On staging: `pct exec <staging CT> -- /usr/local/sbin/scoreboard-deploy --bundle /root/bundle --staging`. Check the sha256 it prints against step 1. Check the app on the phone.
4. Copy **the same two files** into CT 110 the same way, then `pct exec 110 -- /usr/local/sbin/scoreboard-deploy --bundle /root/bundle` (the full path: `pct exec` has no `/usr/local/sbin` on its `PATH`, and a bare `scoreboard-deploy` fails with "Failed to exec"). FREEZE, the live-tournament refusal, the backup, the smoke test and rollback all apply. Before it, `pct exec 110 -- sqlite3 -readonly /opt/scoreboard/pb_data/data.db "select status, name from events;"` shows whether a live tournament will refuse a bundle with a migration. Append to §13 from `/var/log/scoreboard/deploy.log` (its lines use §13's columns). Then remove the copies: `/root/bundle` in the container, `/root/<sha>` on the host.

**What `deploy.sh` checks, in the order it runs** (all three modes):
1. `ENVIRONMENT` says `prod` (or `staging` for `--staging`). `deploy.env` is root's and 0600. No other deploy holds the lock.
2. Prod: `FREEZE` (unless `--force`).
3. Fetch. `<tag>`: the tag's commit must be on `main` (compare API), then the release assets are downloaded. `--staging`: the newest green run; nothing to do if its commit is already running; on `main`; the `bundle-<sha>` artifact. `--bundle`: the two files from the directory.
4. Check the bundle. The sha256 must match. The tar may hold only the five bundle names, with no `..`, absolute paths or links. `BUILD_INFO` must be the expected commit, and `pb_public/build.json` must name the same commit (a `"dev"` build is refused).
5. Prod: while any event is `live` (read with `sqlite3 -readonly`; refused if unreadable), refuse a bundle that adds a migration or changes `POCKETBASE_VERSION`.
6. Fetch (or reuse from `pb-cache`) the pinned PocketBase zip, check its sha256 against `POCKETBASE_VERSION`, unpack it into the release, and check `pocketbase --version`.

Up to here the old release keeps running: a bad bundle causes no downtime. Then it does **stop, copy** (`pre-deploy-<id>-<time>.tar.zst`), switch `current`, **start**, and the smoke test (health JSON `code` 200, and `build.json` `sha` = `BUILD_INFO`, retried for about a minute). On success, older pre-deploy backups are deleted ("until the next good deploy", §7). On failure it switches back and restarts. Staging pings Healthchecks either way (`/fail` on failure).

**Installing on a new container** (done for prod 2026-11-18, `evidence/m0.txt` check 22; staging still to do):
1. Packages: `apt install curl jq unzip zstd sqlite3 libimage-exiftool-perl` (exiftool strips photo locations).
2. `useradd --system --home /opt/scoreboard --shell /usr/sbin/nologin scoreboard`. Then `mkdir -p /opt/scoreboard/releases /etc/scoreboard`, `install -d -o scoreboard -g scoreboard -m 750 /opt/scoreboard/pb_data`.
3. `echo prod > /etc/scoreboard/ENVIRONMENT` (staging: `staging`). Fill `/etc/scoreboard/deploy.env` from `docs/drafts/deploy-env.example` with `install -o root -g root -m 600`.
4. `install -o root -g root -m 755 scripts/deploy.sh /usr/local/sbin/scoreboard-deploy`.
5. `docs/drafts/systemd/scoreboard.service` → `/etc/systemd/system/`. Staging also gets `scoreboard-staging-deploy.service` and `.timer`. Run `systemd-analyze verify` on each, then `systemctl daemon-reload`. Leave the staging timer disabled until CI exists: with no artifacts every run fails and pings `/fail`.
6. Nothing else may hold 127.0.0.1:8090 (on prod the old hand-installed `pocketbase.service` did; Open item 11). The first deploy to an empty `pb_data` has no previous release: if its smoke test fails, the service is left stopped.
7. If `scoreboard.service` fails with a namespace or mount error in the unprivileged LXC, remove `ProtectHome` and `PrivateTmp` and log it in §12.
8. Staging only, once: `scripts/seed-staging --superuser <staging superuser email> --email-pattern '<you>+{k}@<your mail domain>'` (copy it over like `deploy.sh`). It asks for the password and, with MFA, the emailed code. Add the eight addresses it prints to the staging Access app.
9. Then the first superuser (§12) and every setting in §14.

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
- [ ] Add their email to the `club-members` list (Zero Trust → Reusable components → Lists), which the whole-hostname Access app `Scoreboard` allows.
- [ ] Tell them to open the app and choose **Create an account** (name and email; open self sign-up, `decisions.md` 2026-10-25). Or, as before, create their `users` record in the PocketBase admin UI with that email, **a name (never blank: it's their board name)**, `role = member` and `display_units` (optional; empty reads as `lb`); `emailVisibility` stays off.
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
- [ ] On the host, with the container's `pb_data` visible (for example `pct mount 110`, then `/var/lib/lxc/110/rootfs/opt/scoreboard/pb_data`):
      `archive-event copy --pb-data <pb_data> --archive <archive root> <event id>`.
      It copies every photo of the tournament (rejected and retracted catches too) with a `MANIFEST.sha256`, and stops with nothing left behind if a photo is missing or any copy still carries location data (exit 5: tell Kayden-the-developer, don't hand-edit). Note the **Manifest sha256** it prints. `pct unmount 110` when done.
- [ ] Desktop pulls the archive, then runs `archive-event.sh verify --archive <its copy> <event id>`. It must say "Verified" and print **the same Manifest sha256**.
- [ ] Back on the host: `archive-event remove --pb-data <pb_data> --archive <archive root> --desktop-manifest <the hash the desktop printed> --dry-run <event id>`, read the list, then the same without `--dry-run`. It refuses unless the desktop's hash is the host copy's, the host copy still verifies, and the database still lists exactly the archived photos. It deletes the originals and thumbnails from `pb_data/storage` only, outside the API; records and the audit log are untouched, and the app already shows "Photo archived". Running it again is safe.
- [ ] Log it in section 11: date, event, file count, manifest sha256, host copy, desktop verified, removed from app.
- [ ] Laptop pulls and runs `verify` on its next time on the home LAN; tick it in section 11.

`archive-event` exit codes: 0 done · 2 usage · 3 not a final tournament · 4 already archived · 5 location metadata found · 6 desktop hash doesn't match · 7 archive doesn't verify or doesn't match the database · 8 a photo file is missing · 9 a tool is missing.
- [ ] Remove `FREEZE` and start the apt timers again (section 6).

## 10. Site down

1. Is it just you? Check from mobile data, then the Healthchecks status.
2. Post in the group chat: "Scoreboard is down. Keep your photos; submit when it's back. The time limits stretch by the length of the outage." (`scoring.md` §6)
3. Home internet or power out → wait it out; note start and end times.
4. Container or PocketBase down → `pct status`, service logs, restart. Still down → restore (section 7).
5. Record the outage in the outage log (section 12), using the Healthchecks down and up times.
6. When it's back: post the outage times in the group chat. If the outage touched the 24 hours after the window closed, extend the final deadline before closing (section 9, Close and finalize).

## 11. Archive log

"Manifest sha256" is the hash `archive-event copy` and `verify` print.

| Date | Event | Files | Manifest sha256 | Host copy | Desktop verified | Laptop verified | Removed from app |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

## 12. Superuser, break-glass and outage log

Kayden is organizer, judge and superuser, so the superuser account is the one control nobody else checks. **Every superuser action during a tournament gets a line here and a same-day message to the backup judge.** Superuser use is break-glass only (SPEC roles table).

| Date / time | Who | Action | Why | Backup judge told |
|---|---|---|---|---|
| 2026-11-19 04:15 UTC | Kayden | `wipe-demo run` on prod, after the `a3d7ca9` deploy: `pb_data` (the two test members of check 28 and the draft "Example Derby") backed up to `pre-wipe-<time>.tar.zst`, moved aside to `/opt/scoreboard/pb_data.demo-<time>`, and PocketBase started on an empty one | A clean slate for the grading seed (Open item 23) | No tournament ran |
| 2026-11-19 | Kayden | First superuser on the new `pb_data` (installer link), then Mail, Application, proxy header, rate limits and superuser MFA re-entered (§14); own member account re-created and set to organizer | The wipe cleared them | No tournament ran |
| 2026-11-19 | Kayden | `seed-demo --judge <Kayden>`: demo users, Fall Bass live, Summer Bass and Walleye Open final. Photos: 24 from the prototype's Supabase `catch-photos` bucket (12 bass catches, picked at random) | Grading (Open item 23) | No tournament ran |
| 2026-11-19 | Kayden | Created a grader's `users` record (organizer, verified) after adding their email to `club-members` | Grading: the organizer views | No tournament ran |

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

**Signing in to `/_/`:** open `https://streiffseas.com/api/health` and sign in to Access first (you should see the health JSON), then `/_/` **in the same tab**. The admin page belongs to the `Scoreboard admin` app, but its API calls go through `Scoreboard`; signed in to only the first, the admin page says "Something went wrong" or shows "Superuser login" with no form, and the console shows `/api/collections/_superusers/auth-methods` redirected to `cloudflareaccess.com` (`evidence/m0.txt` checks 18, 29). Safari private windows lose this most often: use the same tab or a normal window.

**Creating the first superuser on a new `pb_data`** (the first deploy, a restore into a new container, or `wipe-demo run`): PocketBase prints a one-time setup link valid 30 minutes:
`pct exec <CT> -- journalctl -u scoreboard --no-pager | grep -o 'http[^ ]*pbinstal[^ ]*' | tail -1`.
It's printed with `http://127.0.0.1:8090`: replace that with `https://streiffseas.com` (or `https://staging.streiffseas.com`) before opening it, signed in to Access first as above. Opened as printed on a desktop that runs a dev PocketBase, it reaches that one and fails with 403. If it has expired, `systemctl restart scoreboard` prints a new one. The journal keeps every link it ever printed: use the newest. Then set Mail first (TLS **Always**, section 14), and only then turn on MFA (section 14), since MFA mails a code.

### Demo data for grading (`decisions.md` 2026-11-18, Open item 23)

Prod holds demo data from `scripts/seed-demo` until the wipe before tournament #1. `seed-demo` runs once, on a fresh `pb_data`: it refuses if any tournament or `demo-*@example.com` user exists. Nothing can be deleted through the API, so both ways back are a new `pb_data`, done by `scripts/wipe-demo` (`test/wipeDemo.test.ts`). Done in this order on 2026-11-19 (log above):

1. **Deploy** the build you want graded (§5).
2. **Wipe** (only if `pb_data` holds anything): push `scripts/wipe-demo` as `/usr/local/sbin/wipe-demo` (`--perms 0755`), then `pct exec 110 -- /usr/local/sbin/wipe-demo report` (read-only: who will sign up again, each tournament marked seed or not), then `pct enter 110` and `/usr/local/sbin/wipe-demo run`; type `WIPE`. It stops `scoreboard`, backs `pb_data` up to `/var/backups/scoreboard/pre-wipe-<time>.tar.zst`, moves it to `/opt/scoreboard/pb_data.demo-<time>` (mode 700), starts on an empty one and waits for the migrations; a failed start puts the old one back. It refuses during a deploy, while `FREEZE` exists, or once a tournament the seed didn't make is past draft (`--force` for the last two; log it).
3. **Re-setup:** the first superuser (above), then every setting in §14 in its order, then members create their accounts again.
4. **Seed:** the container needs `curl`, `jq` and `exiftool` (`pct exec 110 -- sh -c 'command -v curl jq exiftool date'`). 10 to 30 fish photos as JPEGs of 5 MB or less, named so each catch's pair sorts together (`01-holding.jpg`, `01-scale.jpg`, …): the script refuses anything else before it sends a thing, and the catches hook strips every photo with exiftool. Copy the folder and `scripts/seed-demo` to the host, push the script as `/usr/local/sbin/seed-demo` and the photos into `/root/demo-photos` (mode 700), then `pct enter 110` and `/usr/local/sbin/seed-demo --superuser <superuser email> --photos /root/demo-photos --judge <your email>` (`--judge` must be an organizer; without it the fake organizer Dana F. judges). Type the superuser password, then the emailed code. Remove the copies afterwards, in the container and on the host.
5. **Check on the phone:** Tournaments shows Fall Bass live and Summer Bass and Walleye Open under Past; the leaderboards have rows; with `--judge`, your Judge queue has 8 catches.

**Graders:** add each grader's own email to `club-members` (§9). They create their account at sign-in, or, for the organizer view, create their `users` record in `/_/` first (email, name, `role = organizer`, verified on, a long random password nobody uses) and tell them to **Sign in**, not create an account. Codes go to their own inbox, so a shared test login won't work. Log it in the table above. The demo anglers can't sign in: `example.com` takes no mail.

**The wipe before tournament #1:** step 2 again (then `/opt/scoreboard/pb_data.demo-<time>` holds the demo; keep it until tournament #1 is under way, then `rm -r` it and `/usr/local/sbin/wipe-demo`), step 3, take graders off `club-members` unless they're members, and strike `decisions.md` Open item 23 with the date.

**Outages** (times from Healthchecks; length rounded up to whole hours, `scoring.md` §6)

| Event | Down | Back up | Length (rounded) | Posted in chat | Final deadline extended? |
|---|---|---|---|---|---|
| | | | | | |

## 13. Deploy log

| Date | App tag | PocketBase version | Backup name | Smoke result | `--force`? |
|---|---|---|---|---|---|
| 2026-11-18 06:34 UTC | none: `--bundle`, commit `567acbb` built locally by `make-bundle.sh` (interim, `decisions.md` 2026-11-17; no CI tested it) | 0.40.4 | `pre-deploy-567acbb…-20261118T063448Z.tar.zst` | Passed (`evidence/m0.txt` check 22) | No |
| 2026-11-19 04:13 UTC | none: `--bundle`, commit `a3d7ca9` built locally by `make-bundle.sh` (interim; no CI tested it); sha256 `e60a197d…b965d3` | 0.40.4 | `pre-deploy-a3d7ca9…-20261119T041333Z.tar.zst` | Passed (`evidence/m0.txt` check 31) | No |

## 14. PocketBase auth settings

Decided 2026-10-07 (`decisions.md`, "Sign-in values"). The `users` auth options (methods, code length, validity, token lifetime) are set by migration `1791815373_update_users.js` (M0-02, `decisions.md` 2026-10-12) and checked by `test/schema.test.ts`. Set the application settings (rate limits, trusted proxy header) by hand on prod and staging, then confirm each one on v0.40.4 and record what you set.

**On every new `pb_data`** (first install, a restore into a new container, `wipe-demo run`) they're all gone with it. Re-enter them in this order, in `/_/` → Settings:
1. **Mail settings:** sender `Streiff Seas` `<noreply@streiffseas.com>`; SMTP `smtp.resend.com`, port `465`, username `resend`, password the Resend API key (§3); under "More options" **TLS encryption: Always**, AUTH `PLAIN`, EHLO `streiffseas.com`. Save, then **Send test email** and check SPF, DKIM, DMARC in Gmail's "Show original". The form defaults to "Auto (StartTLS)": with port 465 that waits for a plain-text greeting that never comes, so the test silently sends nothing and Resend logs nothing (2026-11-18 and again 2026-11-19).
2. **Application:** name `Streiff Seas`, URL `https://streiffseas.com`; user IP proxy header `CF-Connecting-IP` (hyphens), **Use rightmost IP**. Check "Resolved user IP" shows your public IP, not 127.0.0.1.
3. **Rate limiting:** on, the four defaults kept, plus the three rules below.
4. **`_superusers` options:** OTP on, MFA on, password kept. Log out and back in to see the emailed code (only after step 1 works).

| Setting | Value | Set and checked |
|---|---|---|
| Auth methods | OTP on; password and OAuth2 off | By migration (M0-02); confirm after the first deploy |
| OTP code length | 8 digits | By migration (M0-02); confirm after the first deploy |
| OTP validity | 10 minutes | By migration (M0-02); confirm after the first deploy |
| "Send a new code" in the app | after 60 seconds | Built in S1 |
| Rate limit: OTP requests | 3 per client IP per minute: `/api/collections/users/request-otp`, 3 per 60 s, all users | 2026-11-18 prod: `200 200 200 429` (`evidence/m0.txt` check 30). Re-entered 2026-11-19 after the wipe (the table checked by eye; not re-tested with requests) |
| Rate limit: sign-up (`users` create) | 3 per client IP per minute: `users:create`, 3 per 60 s | 2026-11-18 prod: `400 400 400 429` (check 30) |
| Rate limit: OTP sign-in attempts | 5 per client IP per minute: `/api/collections/users/auth-with-otp`, 5 per 60 s; note whether a code is invalidated after failed tries | 2026-11-18 prod: the default `*:auth` (2 per 3 s) trips first on a burst, `400 400 429 429 429 429` (check 30). Whether a code is invalidated after failed tries: TODO |
| Trusted proxy header | `CF-Connecting-IP`, so limits apply per person, not per Cloudflare edge | 2026-11-18 prod: `CF-Connecting-IP`, rightmost IP; the resolved IP went from 127.0.0.1 to the caller's public IP (check 27). Re-entered 2026-11-19 after the wipe |
| Auth token lifetime | 14 days; the app refreshes a valid token each time it opens | By migration (M0-02); confirm after the first deploy |
| Superuser | MFA on; separate superuser on staging | 2026-11-18 prod: OTP and MFA on in `_superusers` options; login asks for the emailed code (check 29). 2026-11-19: a new superuser after the wipe, MFA on again, login with the emailed code worked. Staging: TODO |

PocketBase's default rate limit rules stay on (`*:auth` 2 per 3 s, `*:create` 20 per 5 s, `/api/batch` 3 per 1 s, `/api/` 300 per 10 s). Application settings: name `Streiff Seas`, URL `https://streiffseas.com` (used in email links).

**Open items** for the whole project, ops ones included, are in one list at the bottom of `decisions.md`.

## 15. Setup status (Phase 2)

| Item | Status | Evidence / notes |
|---|---|---|
| Proxmox VE on the home server | Done 6 Oct 2026 | Version TODO in section 1 |
| Cloudflare tunnel | Done 6 Oct 2026 | Named tunnel; `cloudflared` runs inside the prod LXC (confirmed 6 Oct) |
| Domain on Cloudflare DNS | Done 2026-11-17 | `streiffseas.com` |
| Dev VM on its own VLAN, sandbox proven | Done 6 Oct 2026 | Sandbox probes refused (`touch ~/sandbox-probe`: read-only; `curl --noproxy`: can't resolve). `failIfUnavailable` stopped Claude Code until bubblewrap was installed. `docs/evidence/m0.txt` | `touch ~/sandbox-probe` refused; `curl --noproxy '*'` can't resolve |
| Private repo, rulesets, guardrails installed | Done 6 Oct 2026 | Direct push to `main` refused (GH013); tag test showed the deploy-key bypass (section 1); Claude Code refused an edit to `.claude/settings.json`, a shell append to it and `git push origin main`; the guard hook blocks when run by hand. `docs/evidence/m0.txt` |
| Prod LXC, prod VLAN and firewall | Done 8 Oct 2026 for prod and the dev VM | CT 110 on `vmbr1`; checks 10-14 in `evidence/m0.txt`; staging still to test |
| Access apps (whole hostname, `/_/`), service token | Done 2026-11-18 | X-ACC-01 to 04, `evidence/m0.txt` checks 15 to 18 |
| Tunnel token root-only in prod | Done 2026-11-18 | `evidence/m0.txt` check 19 |
| `sshd` and Postfix removed from prod | Done 2026-11-18 | `evidence/m0.txt` check 20: only PocketBase (127.0.0.1:8090) and cloudflared's metrics (127.0.0.1:20241) listen |
| SMTP (Resend), SPF, DKIM, DMARC | Done 2026-11-18 | `evidence/m0.txt` checks 25, 26: test email SPF, DKIM, DMARC PASS |
| PocketBase auth settings: proxy header, rate limits | Done 2026-11-18 on prod | Section 14; `evidence/m0.txt` checks 27, 30. Still to confirm: the migration-set values, and whether a code is invalidated after failed tries |
| Superuser MFA (prod) | Done 2026-11-18; again 2026-11-19 after the wipe | `evidence/m0.txt` check 29; section 12 log |
| Two named test members | Done 2026-11-18; wiped 2026-11-19 (they sign up again) | `evidence/m0.txt` check 28 |
| `deploy.sh`, `scoreboard.service`, install layout (prod) | Done 2026-11-18 | `evidence/m0.txt` check 22; tests `test/deploy.test.ts`, `test/makeBundle.test.ts`, `test/systemdUnits.test.ts` |
| First deploy of a tag | TODO; interim `--bundle` deploys ran 2026-11-18 (`567acbb`) and 2026-11-19 (`a3d7ca9`) | Section 13; `evidence/m0.txt` checks 22, 31 |
| CI: `ci.yml`, bundle artifact, release job | TODO (M0-05a; Open item 21) | |
| Demo data for grading | Done 2026-11-19 (wipe, re-setup, `seed-demo`, a grader account) | Section 12; wipe before tournament #1 still to do |
| B2 bucket, encrypted push, restore | TODO | `evidence/m0.txt` |
| Healthchecks probe and phone alert | TODO | Deliberate outage in `evidence/m0.txt` |
| 15-minute soak (X-ACC-05) | TODO | `evidence/m0.txt` |
| Staging LXC, staging VLAN, tunnel, Access app and `staging-probe` token | TODO | Section 2 check in `evidence/m0.txt` |
| Staging timer: first automatic deploy, and one deliberately failed build alerting the phone | TODO | `evidence/m0.txt` |
| `pre-push` hook installed (`git config core.hooksPath .githooks`) | TODO | |
