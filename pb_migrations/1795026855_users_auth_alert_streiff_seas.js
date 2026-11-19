/// <reference path="../pb_data/types.d.ts" />
// decisions.md Open item 22 (Kayden, 2026-11-18): the app is now Streiff Seas. Rewords the new-device
// sign-in alert from 1794939210_users_auth_alert_wording.js (committed, so not edited) with the new name.
// Only the name changes: the same advice, the same {ALERT_INFO} placeholder, the alert stays on.
// The name is written out because {APP_NAME} reads the app name setting, which is "Acme" until set.
// Forward-only: no down function (docs/dev-lifecycle-guide.md).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.authAlert.enabled = true
  users.authAlert.emailTemplate.subject = "New sign-in to Streiff Seas"
  users.authAlert.emailTemplate.body = [
    "<p>Hello,</p>",
    "<p>We noticed a sign-in to your Streiff Seas account from a new device or location:</p>",
    "<p><em>{ALERT_INFO}</em></p>",
    "<p>If this was you, you don't need to do anything.</p>",
    "<p><strong>If it wasn't you, someone may have access to your email, because sign-in codes go there. " +
      "Secure your email account, then talk to a club organizer or admin.</strong></p>",
    "<p>Thanks,<br/>Streiff Seas</p>",
  ].join("\n")
  app.save(users)
})
