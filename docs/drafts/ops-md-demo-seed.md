# Draft for ops.md: demo data for grading (DEMO-01)

Kayden: `docs/ops.md` is yours to edit. These are the steps `scripts/seed-demo` needs there
(decisions.md 2026-11-18 "Demo data on prod for grading"; Open item 23). Install what you agree
with, then delete this file.

## §12 Superuser, break-glass and outage log: a new subsection after "Other superuser actions"

### Demo data for grading (decisions.md 2026-11-18)

Prod holds demo data from this seed until the wipe before tournament #1. Run it once, on a fresh
`pb_data`: it refuses if any tournament or `demo-*@example.com` user already exists.

- [ ] Deploy the build that has real Profile stats first (DEMO-01 merged), so graders don't see
      the old sample numbers.
- [ ] The container has the tools: `pct exec 110 -- sh -c 'command -v curl jq exiftool'` prints
      three paths. If not: `pct exec 110 -- apt install curl jq libimage-exiftool-perl`.
      exiftool is needed for real catches anyway (the location strip).
- [ ] Photos on the desktop: 10 to 30 fish photos as JPEGs of 5 MB or less each (export from
      Photos as JPEG, most compatible, if they're HEIC). The script refuses anything else before
      it sends a thing. Every catch gets two, taken in turn, and each is stripped on upload.
- [ ] Push the script and the photos into the container (from the host):
      `pct push 110 scripts/seed-demo /usr/local/sbin/seed-demo --perms 0755`
      `pct exec 110 -- mkdir -m 700 /root/demo-photos`
      `for f in <photos folder>/*.jpg; do pct push 110 "$f" "/root/demo-photos/$(basename "$f")"; done`
- [ ] Run it with a terminal, so the password prompt works: `pct enter 110`, then
      `seed-demo --superuser <superuser email> --photos /root/demo-photos --judge <your email>`
      (leave out `--judge` to have the fake organizer Dana F. judge the live tournament).
      Type the superuser password, then the code emailed to the superuser address. It takes a
      few minutes; each step prints a line, and the end prints each tournament's counts.
- [ ] Remove the copies: `rm -r /root/demo-photos /usr/local/sbin/seed-demo`, then `exit`.
- [ ] Check on the phone: Tournaments shows Fall Bass live and Summer Bass and Walleye Open
      under Past; the leaderboards have rows; with `--judge`, your Judge queue has 8 catches.
- [ ] Log it in the table above: date, "seed-demo", the counts it printed.

**Graders:** add each grader's own email to `club-members` (§9 "Adding a member"); they create
their account at sign-in (codes go to their own inbox, so a shared test login won't work). For
the organizer view, set that user's `role` to organizer in `/_/` and log it in "Other superuser
actions". The demo anglers can't sign in: `example.com` takes no mail.

**The wipe before tournament #1** (nothing can be deleted through the API, so it's a new
`pb_data`):

- [ ] Final backup, then stop `scoreboard`.
- [ ] Move `pb_data` aside (keep it until tournament #1 is under way, then delete it), start
      `scoreboard` on an empty `pb_data`.
- [ ] Create the first superuser (the setup link above), turn on MFA, re-enter every setting in §14
      and the SMTP settings in §3, and check them as in `evidence/m0.txt`.
- [ ] Members create their accounts again; set the organizers' roles in `/_/`.
- [ ] Take graders off `club-members` unless they're members.
- [ ] Strike `decisions.md` Open item 23 with the date.

## §15 Setup status: a new row

| Demo data for grading | TODO | `seed-demo` counts logged in §12 | Tournaments shows one live and two past |
