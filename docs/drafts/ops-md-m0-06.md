# Draft for `docs/ops.md` (from M0-06, 2026-11-18)

`ops.md` is read-only for Claude Code. These are the changes from the M0-06 work so far, for Kayden
to copy in, then delete this file. They go with the decisions.md 2026-11-18 row "Open items 12 and
13 settled, 14 in part" and `docs/evidence/m0.txt` checks 15 to 19. `TODO` marks a value only
Kayden has.

## §1 Inventory

- **Prod container:** "Own bridge `vmbr1`" stays; add "(a host-routed bridge, not a VLAN;
  decisions.md 2026-11-18). No `sshd` or Postfix: access is `pct exec` from the host."
- **cloudflared:** Version `2026.11.1` (2026.10.0 until the hand `apt upgrade` of 2026-11-18;
  unattended-upgrades takes Debian security updates only, so cloudflared moves only by hand,
  as §6 wants). Notes: "Named tunnel `streiffserver`, route
  `streiffseas.com` → `http://127.0.0.1:8090`. `cloudflared.service` runs
  `tunnel run --no-autoupdate --token-file /etc/cloudflared/token` as root."
- **Cloudflare Access app, whole hostname:** "App `Scoreboard` on `streiffseas.com`, team
  `streiffseas.cloudflareaccess.com` (Zero Trust Free, 50 seats). Policies: `Members` (Allow, Email
  List `club-members`) and `Uptime probe` (Service Auth, Service Token `uptime-probe` only, never
  'Any Access Service Token'). One-time PIN only, instant auth, 1-week session, no Bypass."
- **Cloudflare Access app, `/_/`:** "App `Scoreboard admin` on `streiffseas.com/_/`. Policy
  `Kayden only` (Allow, Kayden's email). One-time PIN only, 24-hour session. Its `/api/` calls go
  through the `Scoreboard` app, so Kayden's email is on `club-members` too."
- **Domain / DNS:** "`streiffseas.com`, registered TODO (Cloudflare Registrar?) on 2026-11-17,
  DNS on Cloudflare. Auto-renew **on**; expires TODO."
- **Staging container:** "staging VLAN `TODO`" becomes "its own host-routed bridge `TODO`". Its
  hostname is `staging.streiffseas.com`.

## §2 Network and firewall

Add this paragraph above the table:

> The containers sit on host-routed bridges (`vmbr1` prod, `vmbr2` dev VM, staging its own), not
> VLANs. "Home LAN" means the Proxmox host's Wi-Fi uplink, 10.34.0.0/18 via 10.34.0.1. Outbound
> internet from prod and staging is **open** (decisions.md 2026-11-18): the Allow rows below list
> what each container needs, not a filter. The **Deny** rows are enforced by the host and checked
> for the M0 gate.

## §3 Secrets

- **Tunnel token:** Lives in "Prod LXC, `/etc/cloudflared/token` (root, 0600)".
- **Access service token (probe, smoke test):** name `uptime-probe`; Rotate "Before expiry
  TODO (1 year from 2026-11-18)".

## §9 Tournament runbook, "Any time: adding or removing a member"

Add to the first item: "Add their email to the `club-members` list (Zero Trust → Reusable
components → Lists), which the Access app `Scoreboard` allows."

Add a line under §12 "Other superuser actions" (or wherever `/_/` is first used):

> Open `https://streiffseas.com/` and sign in to Access first, then `/_/`. The admin page belongs
> to the `Scoreboard admin` app, but its API calls go through `Scoreboard`; signed in to only the
> first, the admin page says "Something went wrong" (`m0.txt` check 18).

## §15 Setup status

| Item | Status | Evidence / notes |
|---|---|---|
| Domain on Cloudflare DNS | Done 2026-11-17 | `streiffseas.com` |
| Access apps (whole hostname, `/_/`), service token | Done 2026-11-18 | X-ACC-01 to 04, `m0.txt` checks 15 to 18 |
| Tunnel token root-only in prod | Done 2026-11-18 | `m0.txt` check 19 |
| `sshd` and Postfix removed from prod | Done 2026-11-18 | `m0.txt` check 20: only PocketBase (127.0.0.1:8090) and cloudflared's metrics (127.0.0.1:20241) listen |
