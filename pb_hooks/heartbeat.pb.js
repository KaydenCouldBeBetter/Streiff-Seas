/// <reference path="../pb_data/types.d.ts" />
// Heartbeat (docs/dev-lifecycle-guide.md "The approach in one page"; features.json M0-03):
// PocketBase's realtime stream sends no keepalive and drops after 5 idle minutes, and
// Cloudflare cuts idle reads at 125 s. Once a minute this sends an empty "heartbeat" message
// to every realtime client subscribed to that topic, and to no one else, so a page that is
// listening keeps its stream open and can tell a quiet board from a dead connection
// (web/src/lib/liveTracker.ts). The message carries nothing: any client may subscribe to it.
//
// Runs in goja: CommonJS only, no async/await, no setInterval, no Node or browser APIs.
// The app subscribes without options, so the subscription key is exactly "heartbeat".
// The test runs the job at once through the superuser's POST /api/crons/heartbeat.
cronAdd("heartbeat", "* * * * *", () => {
  const message = new SubscriptionMessage({ name: "heartbeat", data: "{}" })
  const clients = $app.subscriptionsBroker().clients()
  for (const id in clients) {
    if (clients[id].hasSubscription("heartbeat")) {
      clients[id].send(message)
    }
  }
})
