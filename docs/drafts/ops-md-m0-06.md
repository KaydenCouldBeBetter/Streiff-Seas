# Draft for `docs/ops.md` (from M0-06, 2026-11-18)

`ops.md` is read-only for Claude Code. These are the changes from the M0-06 work so far, for Kayden
to copy in, then delete this file. They go with the decisions.md 2026-11-18 row "Open items 12 and
13 settled, 14 in part" and `docs/evidence/m0.txt` checks 15 to 30. `TODO` marks a value only
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
- **SMTP for PocketBase OTP:** Provider "Resend (free tier: 100 emails a day, 3,000 a month,
  reset at 00:00 UTC)". Notes: "Sender `Streiff Seas <noreply@streiffseas.com>`, via
  `smtp.resend.com:465`, TLS always. Domain `streiffseas.com` verified in Resend: DKIM TXT
  `resend._domainkey`, SPF by the CNAMEs `send` and `rsend`, DMARC TXT `_dmarc` `p=none`; receiving
  off. Cloudflare Access PINs come from Cloudflare and don't count toward the quota. Staging will
  share the account and its daily quota (`m0.txt` checks 25, 26)."
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
  TODO (1 year from 2026-11-18)". Lives in: "Prod LXC, root-only env file (`/etc/scoreboard/deploy.env`,
  for the smoke test); a copy on Kayden's Fedora desktop for the X-ACC checks". Cloudflare shows
  the secret only at creation, so those are the only copies; consider the password manager too.
- **SMTP credentials:** "A Resend API key, Sending access, limited to `streiffseas.com`, named
  TODO; in PocketBase's Mail settings (in `pb_data`)". Rotate: make a new key in Resend, paste it
  into Mail settings, send a test email, then delete the old key.
- **Staging SMTP credentials:** "A separate Resend key, same restrictions, made when staging is
  built."

## §9 Tournament runbook, "Any time: adding or removing a member"

Add to the first item: "Add their email to the `club-members` list (Zero Trust → Reusable
components → Lists), which the Access app `Scoreboard` allows."

Add a line under §12 "Other superuser actions" (or wherever `/_/` is first used):

> Open `https://streiffseas.com/api/health` and sign in to Access first (you should see the
> health JSON), then `/_/` **in the same tab**. The admin page belongs to the `Scoreboard admin`
> app, but its API calls go through `Scoreboard`; signed in to only the first, the admin page
> says "Something went wrong" or shows "Superuser login" with no form, and the console shows
> `/api/collections/_superusers/auth-methods` redirected to `cloudflareaccess.com` (`m0.txt`
> checks 18, 29). Safari private windows lose this most often: use the same tab or a normal
> window.

## §12 Superuser: creating the first one on a new `pb_data`

Add under "Other superuser actions":

> On a new, empty `pb_data` (the first deploy, or after a restore into a new container),
> PocketBase prints a one-time setup link valid 30 minutes:
> `pct exec <CT> -- journalctl -u scoreboard --no-pager | grep -o 'http[^ ]*pbinstal[^ ]*' | tail -1`.
> It's printed with `http://127.0.0.1:8090`: replace that with `https://streiffseas.com` (or
> `https://staging.streiffseas.com`) before opening it, signed in to Access at `/` first. Opened
> as printed on a desktop that runs a dev PocketBase, it reaches that one and fails with 403.
> If it has expired, `systemctl restart scoreboard` prints a new one. Then turn on MFA (§14).

## §14 PocketBase auth settings

Fill the "Set and checked" column (prod; staging when built):

| Setting | Set and checked |
|---|---|
| Auth methods, OTP code length, OTP validity | TODO Kayden: confirm on prod in `users` → Options (expected from the migration) |
| Rate limit: OTP requests | `/api/collections/users/request-otp` 3 per 60 s, all users; 2026-11-18, `200 200 200 429` (`m0.txt` check 30) |
| Rate limit: sign-up | `users:create` 3 per 60 s; 2026-11-18, `400 400 400 429` (check 30) |
| Rate limit: OTP sign-in attempts | `/api/collections/users/auth-with-otp` 5 per 60 s; the default `*:auth` (2 per 3 s) trips first on a burst, `400 400 429…` (check 30). Whether a code is invalidated after failed tries: not checked yet |
| Trusted proxy header | `CF-Connecting-IP`, rightmost IP; 2026-11-18, resolved IP went from 127.0.0.1 to the caller's public IP (check 27) |
| Superuser | MFA on (OTP and MFA in `_superusers` options); 2026-11-18, login asks for the emailed code (check 29). Staging: TODO |

Also add under the table: "PocketBase's default rate limit rules stay on (`*:auth` 2 per 3 s,
`*:create` 20 per 5 s, `/api/batch` 3 per 1 s, `/api/` 300 per 10 s). Application settings:
name `Streiff Seas`, URL `https://streiffseas.com` (used in email links)."

## §15 Setup status

| Item | Status | Evidence / notes |
|---|---|---|
| Domain on Cloudflare DNS | Done 2026-11-17 | `streiffseas.com` |
| Access apps (whole hostname, `/_/`), service token | Done 2026-11-18 | X-ACC-01 to 04, `m0.txt` checks 15 to 18 |
| Tunnel token root-only in prod | Done 2026-11-18 | `m0.txt` check 19 |
| `sshd` and Postfix removed from prod | Done 2026-11-18 | `m0.txt` check 20: only PocketBase (127.0.0.1:8090) and cloudflared's metrics (127.0.0.1:20241) listen |
| SMTP (Resend), SPF, DKIM, DMARC | Done 2026-11-18 | `m0.txt` checks 25, 26: test email SPF, DKIM, DMARC PASS |
| Proxy header, rate limits | Done 2026-11-18 | `m0.txt` checks 27, 30 |
| Superuser MFA (prod) | Done 2026-11-18 | `m0.txt` check 29 |
| Two named test members | Done 2026-11-18 | `m0.txt` check 28 |
