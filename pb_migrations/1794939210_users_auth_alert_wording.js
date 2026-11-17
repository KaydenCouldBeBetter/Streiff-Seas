/// <reference path="../pb_data/types.d.ts" />
// decisions.md Open item 16 (Kayden, 2026-11-17): reword the new-device sign-in alert. PocketBase's
// default tells a member to change their password, and members have none (OTP only, decisions.md
// L1). A sign-in they didn't make means someone can read their email, where the codes go, so it
// tells them to secure it and talk to a club organizer or admin. The alert stays on.
// The club's name is written out: {APP_NAME} reads the app name setting, which is "Acme" until
// someone sets it. {ALERT_INFO} is PocketBase's time, IP and device line.
// Forward-only: no down function (docs/dev-lifecycle-guide.md).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.authAlert.enabled = true
  users.authAlert.emailTemplate.subject = "New sign-in to Chromie Fishing"
  users.authAlert.emailTemplate.body = [
    "<p>Hello,</p>",
    "<p>We noticed a sign-in to your Chromie Fishing account from a new device or location:</p>",
    "<p><em>{ALERT_INFO}</em></p>",
    "<p>If this was you, you don't need to do anything.</p>",
    "<p><strong>If it wasn't you, someone may have access to your email, because sign-in codes go there. " +
      "Secure your email account, then talk to a club organizer or admin.</strong></p>",
    "<p>Thanks,<br/>Chromie Fishing</p>",
  ].join("\n")
  app.save(users)
})
