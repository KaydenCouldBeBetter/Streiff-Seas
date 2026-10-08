# Draft for `docs/ops.md` §5 (from M0-01, 2026-10-08)

`ops.md` is read-only for Claude Code, so this is for Kayden to copy in. It settles `decisions.md` Open items #2; strike that item through once it's in.

Add under "`deploy.sh <tag>` on prod, in order", step 7:

> **Health endpoint on v0.40.4:** `GET /api/health` returns `200` with `Content-Type: application/json` and the body `{"message":"API is healthy.","code":200,"data":{}}`. The smoke test must check the JSON body (`"code":200`), not only the status: with the index fallback on, any unknown path, `/api/` paths included, also answers `200` with `index.html`.
>
> **Build ID:** `GET /build.json` returns `{"sha":"<40-character commit>","built_at":"<UTC ISO 8601>"}`; `sha` is `"dev"` for a build made outside CI. The smoke test compares `sha` with the commit in `BUILD_INFO`.
>
> **Index fallback:** `pocketbase serve --indexFallback` is on by default on v0.40.4, so a refresh on a client route loads the app. The systemd unit should still pass `--indexFallback=true` so a changed default can't break it silently. A missing asset under `/assets/` also gets `index.html` with `200`, never a `404`.
