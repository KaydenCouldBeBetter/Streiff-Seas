/// <reference path="../pb_data/types.d.ts" />
// users: PocketBase's built-in auth collection, changed in place. It ships with public
// sign-up and own-record rules; members are invited by the superuser, so every rule is null.
// Forward-only: no down function (a down would reopen sign-up).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")

  users.listRule = null
  users.viewRule = null
  users.createRule = null
  users.updateRule = null
  users.deleteRule = null
  users.manageRule = null

  // Sign-in is OTP only (decisions.md L1), with the values decided on 2026-10-07:
  // an 8-digit code valid for 10 minutes, and a 14-day auth token.
  users.otp.enabled = true
  users.otp.length = 8
  users.otp.duration = 600
  users.authToken.duration = 1209600
  users.passwordAuth.enabled = false
  users.oauth2.enabled = false
  users.mfa.enabled = false

  users.fields.removeByName("avatar")
  users.fields.add(
    new SelectField({ name: "role", required: true, maxSelect: 1, values: ["member", "organizer"] }),
    // Optional: empty reads as lb.
    new SelectField({ name: "display_units", maxSelect: 1, values: ["lb", "lb_oz"] }),
  )

  app.save(users)
})
