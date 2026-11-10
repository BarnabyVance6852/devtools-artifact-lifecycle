import { lifecycleRules } from "./artifact_policy.js";
import { InfraiClient } from "./infrai.js";

export async function installRetention(
  input: { bucket: string; sweep_url: string },
  infrai: InfraiClient,
) {
  const version = "devtools-retention-v1";
  await infrai.storage.bucket.create(input.bucket, `${version}:bucket:${input.bucket}`);
  await infrai.storage.bucket.set_lifecycle(
    input.bucket,
    lifecycleRules,
    `${version}:rules:${input.bucket}`,
  );
  const schedule = await infrai.cron.create(
    "17 * * * *",
    input.sweep_url,
    `${version}:sweep:${input.bucket}`,
  );
  return {
    bucket: input.bucket,
    lifecycle_rule_count: lifecycleRules.length,
    sweep_job_id: schedule.job_id,
  };
}
