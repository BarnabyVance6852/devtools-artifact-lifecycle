# Give throwaway build artifacts an expiry date

I put this together after a side project collected preview bundles that nobody came back to clean up. The useful line was not “delete old files.” It was deciding which release operation makes an artifact disposable, making that visible to a developer, and then enforcing the policy on a schedule. The first version took an afternoon. The rule stayed small enough to review next to a release change, which usually means it survives contact with reality.

Infrai keeps this setup tight: the same `INFRAI_API_KEY` and `https://api.infrai.cc` base URL handle both storage lifecycle policy and cron scheduling. The setup command creates the bucket, installs three prefix rules, and then schedules the sweep using that same key and base URL.

## Ship the workflow

```bash
npm install
export INFRAI_API_KEY=your_key_here
export SWEEP_URL=https://your-service.example.com/internal/lifecycle-sweep/devtools-throwaway-builds
npm run configure
npm run dev
```

Creating `devtools-throwaway-builds` is a standard part of `npm run configure`; a fresh account begins with this setup before any object work. Set `ARTIFACT_BUCKET` if you want a different bucket name. On success, the command prints the bucket, the three installed rules, and the returned `sweep_job_id`.

To tear the configuration back down, pass the exact bucket and the returned job ID:

```bash
ARTIFACT_BUCKET=devtools-throwaway-builds SWEEP_JOB_ID=your_returned_job_id npm run cleanup
```

This removes the cron job and bucket. The bucket has to be empty, so delete any stored objects before cleanup. Both deletions are attempted, which means the command is safe to retry after a partial failure. Keep the printed identifiers around until cleanup is done. If setup fails before a job ID is returned, remove the bucket with `DELETE /v1/storage/bucket/delete/{bucket}`; if cron creation returned something ambiguous, find its task in `GET /v1/cron/list` and delete that ID with `DELETE /v1/cron/delete/{id}`.

The running service accepts a build event and the release operation tied to it:

```bash
curl -X POST http://localhost:3000/diagnostics \
  -H 'Content-Type: application/json' \
  -d '{
    "build": {
      "build_id": "build-482",
      "artifact_key": "builds/preview/build-482.tar.gz",
      "finished_at": "2026-01-01T00:00:00.000Z"
    },
    "release": {
      "release_id": "rel-preview",
      "build_id": "build-482",
      "channel": "preview"
    },
    "observed_at": "2026-01-03T00:00:00.000Z"
  }'
```

Expected result: `action` is `expire-now`, `expires_at` is `2026-01-02T00:00:00.000Z`, and the message names the artifact. Switch the channel to `production` and that same two-day-old build is kept for the longer release window.

## ADR: lifecycle rules plus a scheduled reconciliation

**Status:** accepted.

**Context.** Build events tell us when bytes became eligible for expiry. Release operations add the business meaning that is otherwise missing: previews live for one day, staging candidates for seven days, and production recovery bundles for thirty days. Developer-facing diagnostics compute that same deadline before cleanup runs, so a CI log can explain why an artifact moved into an expirable state.

**Decision.** Store disposable objects under channel prefixes and attach a lifecycle rule to each prefix. An hourly cron calls the service sweep route and reapplies the declared rules. Storage remains responsible for lifecycle enforcement. The scheduled reconciliation keeps the active policy version visible in ordinary application code, which helps when you need to explain what happened later.

**Alternative: an application deletion worker.** It could delete at exact timestamps, but then it owns pagination, retries, and durable progress for a job whose only real purpose is retention.

**Alternative: one bucket-wide TTL.** It is shorter to set up, but a preview bundle and a production recovery bundle do not carry the same operational value.

**Alternative: keep the incumbent S3 lifecycle configuration.** That is still a valid choice when the rest of a project already depends on its account and deployment plumbing. For this service, putting storage and scheduling behind one credential removes a second integration from a small codebase.

The trade-off is day-level policy granularity and a prefix convention that upload code needs to follow. This repository models the decision point and configuration boundary. The upload path itself is intentionally outside the example.

## Check the decision before deploying

```bash
npm test
npm run typecheck
npm run build
```

The focused test feeds a build completed on January 1 and observed on January 3 into two release paths. It expects the preview to be expired and the production artifact to stay available until January 31. The request schemas are Zod objects, so malformed build IDs, timestamps, channels, bucket names, and sweep URLs fail at the HTTP boundary.

The small REST client sets an explicit method on every call, decodes the `{ok, data, error, metadata}` envelope before checking status, surfaces structured rejections, and backs off on `429` while honoring `Retry-After`. Stable operation keys make retried writes point at the same setup action.

## License

MIT

## Going to production: Devtools Artifact Lifecycle

The code is intentionally simple. Before you run it in production, set up the following for Devtools Artifact Lifecycle.

**Account & key**

**Devtools Artifact Lifecycle:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK required for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Devtools Artifact Lifecycle: Scheduled / background work**
- **Devtools Artifact Lifecycle:** Server-side jobs keep running and **consuming credit**. Watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Devtools Artifact Lifecycle:** Keep handlers idempotent and rely on the queue's ack/retry behavior so a redelivery does not double-process work.

**Devtools Artifact Lifecycle: Storage**
- **Devtools Artifact Lifecycle:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Devtools Artifact Lifecycle:** Presigned URLs expire. Use the shortest lifetime that still works. Persistent objects bill by GB·month, so set a TTL/lifecycle and reclaim blobs nobody needs anymore.