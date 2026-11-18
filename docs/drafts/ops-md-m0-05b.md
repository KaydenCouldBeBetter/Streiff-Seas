# Draft for `docs/ops.md` (from M0-05b, 2026-11-17)

`ops.md` is read-only for Claude Code. These are the changes for Kayden to copy in. They go with the decisions.md 2026-11-17 rows "Interim: deploy a locally built bundle while GitHub is locked" and "M0-05b deploy calls", and Open item 21.

## A. §1 Inventory: replace the PocketBase row's `systemd unit TODO`

> | PocketBase | Prod LXC, `127.0.0.1:8090`, systemd unit `scoreboard.service` (user `scoreboard`) | … | Kayden | Layout: `/opt/scoreboard/releases/<tag or sha>/` (pb_public, pb_hooks, pb_migrations, POCKETBASE_VERSION, BUILD_INFO, the pinned `pocketbase`), `/opt/scoreboard/current` → the running release, `/opt/scoreboard/pb_data/` (the only path the unit can write), `/opt/scoreboard/pb-cache/<version>/` (verified PocketBase zips). `/etc/scoreboard/`: `ENVIRONMENT` (`prod` or `staging`), `FREEZE` (only during a freeze), `deploy.env` (root, 0600). Pre-deploy backups in `/var/backups/scoreboard/`, deploy log in `/var/log/scoreboard/deploy.log`. `deploy.sh` is installed by hand as `/usr/local/sbin/scoreboard-deploy` (a copy of `scripts/deploy.sh`); reinstall it when that file changes. Never run `./pocketbase update` on prod. |

Staging's row: "Same layout, unit and `scoreboard-deploy` as prod, plus `scoreboard-staging-deploy.service` and `.timer`."

## B. §3 Secrets: where the deploy secrets live

In the rows "Access service token", "GitHub release-read token", "Staging Access service token" and "GitHub staging token", the "Lives in" cell becomes `/etc/scoreboard/deploy.env` (root, 0600) on that container. Key names are in `docs/drafts/deploy-env.example`: `GITHUB_REPO`, `GITHUB_TOKEN`, `SMOKE_URL`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, and `HEALTHCHECKS_URL` on staging only.

## C. §5: new text after "**If a smoke test fails:** …"

> **Not built yet: CI.** GitHub is locked (decisions.md 2026-11-17), so nothing builds bundles and steps 2–4 and 6 of "From change to prod" can't run. Until M0-05a is back, use the interim path below.
>
> **Interim: a locally built bundle** (decisions.md 2026-11-17, interim row). Prod runs a bundle built on Kayden's machine, **not one CI tested**.
> 1. On Kayden's machine, on `main` after the merge is pushed, with Node 24 (`nvm use`): `scripts/make-bundle.sh`. It refuses a dirty tree, a commit that isn't on `origin/main`, or another Node major, then runs `npm run check` and writes `bundles/<sha>/bundle.tar.gz` and `bundle.sha256`. Note the sha256 it prints.
> 2. Copy both files to the staging container. From the Proxmox host: `pct push <staging CT> bundle.tar.gz /root/bundle/bundle.tar.gz` and the same for `bundle.sha256`.
> 3. On staging: `scoreboard-deploy --bundle /root/bundle --staging`. Check the sha256 it prints against step 1. Check the app on the phone.
> 4. Copy **the same two files** to prod the same way, then `scoreboard-deploy --bundle /root/bundle`. FREEZE, the live-tournament refusal, the backup, the smoke test and rollback all apply. Append to §13 from `/var/log/scoreboard/deploy.log` (its lines use §13's columns).
>
> **What `deploy.sh` checks, in the order it runs** (all three modes; `<tag>` and `--staging` as above):
> 1. `ENVIRONMENT` says `prod` (or `staging` for `--staging`). `deploy.env` is root's and 0600. No other deploy holds the lock.
> 2. Prod: `FREEZE` (unless `--force`).
> 3. Fetch. `<tag>`: the tag's commit must be on `main` (compare API), then the release assets are downloaded. `--staging`: the newest green run; nothing to do if its commit is already running; on `main`; the `bundle-<sha>` artifact. `--bundle`: the two files from the directory.
> 4. Check the bundle. The sha256 must match. The tar may hold only the five bundle names, with no `..`, absolute paths or links. `BUILD_INFO` must be the expected commit, and `pb_public/build.json` must name the same commit (a `"dev"` build is refused).
> 5. Prod: while any event is `live` (read with `sqlite3 -readonly`; refused if unreadable), refuse a bundle that adds a migration or changes `POCKETBASE_VERSION`.
> 6. Fetch (or reuse from `pb-cache`) the pinned PocketBase zip, check its sha256 against `POCKETBASE_VERSION`, unpack it into the release, and check `pocketbase --version`.
>
> Up to here the old release keeps running: a bad bundle causes no downtime. Then it does **stop, copy** (`pre-deploy-<id>-<time>.tar.zst`), switch `current`, **start**, and the smoke test (health JSON `code` 200, and `build.json` `sha` = `BUILD_INFO`, retried for about a minute). On success, older pre-deploy backups are deleted ("until the next good deploy", §7). On failure it switches back and restarts. Staging pings Healthchecks either way (`/fail` on failure).

## D. §15 Setup status: rows to add

| Item | Status | Evidence / notes |
|---|---|---|
| `deploy.sh`, units, seed script | Built and tested against stubs 17 Nov 2026 (M0-05b); not installed | `test/deploy.test.ts`, `test/makeBundle.test.ts`, `test/seedStaging.test.ts`, `test/systemdUnits.test.ts` |
| CI, `ci.yml`, bundle artifact, release job | TODO (M0-05a, set aside 17 Nov 2026: GitHub locked) | |

## E. Installing it (M0-06, both containers unless noted)

1. Packages: `apt install curl jq unzip zstd sqlite3` (and exiftool, already needed for photos).
2. `useradd --system --home /opt/scoreboard --shell /usr/sbin/nologin scoreboard`. Then `mkdir -p /opt/scoreboard/releases /etc/scoreboard`, `install -d -o scoreboard -g scoreboard -m 750 /opt/scoreboard/pb_data`.
3. `echo prod > /etc/scoreboard/ENVIRONMENT` (staging: `staging`). Fill `/etc/scoreboard/deploy.env` from `docs/drafts/deploy-env.example` with `install -o root -g root -m 600`.
4. `install -o root -g root -m 755 scripts/deploy.sh /usr/local/sbin/scoreboard-deploy`.
5. `docs/drafts/systemd/scoreboard.service` → `/etc/systemd/system/`. Staging also gets `scoreboard-staging-deploy.service` and `.timer`. Run `systemd-analyze verify` on each, then `systemctl daemon-reload`. Leave the timer disabled until CI exists: with no artifacts every run fails and pings `/fail`.
6. Open item 11: **before** the first `scoreboard-deploy`, `systemctl disable --now pocketbase.service`. It holds 127.0.0.1:8090, the port `scoreboard.service` needs; left running, the smoke test would reach the old PocketBase and fail, and with no previous release the deploy leaves the service stopped. Remove the hand install (`/opt/pocketbase`, `/etc/systemd/system/pocketbase.service`) once the first deploy is green. Keep no data from it.
7. The first deploy to an empty `pb_data` has no previous release. If its smoke test fails, the service is left stopped.
8. If `scoreboard.service` fails with a namespace or mount error in the unprivileged LXC, remove `ProtectHome` and `PrivateTmp` (not tried there; `NoNewPrivileges` and `ProtectSystem=strict` were, in the photo spike) and log it in §12.
9. Staging only, once: `scripts/seed-staging --superuser <staging superuser email> --email-pattern '<you>+{k}@<your mail domain>'` (copy it over like deploy.sh). It asks for the password and, with MFA, the emailed code. Add the eight addresses it prints to the staging Access app.
