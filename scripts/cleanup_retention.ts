import { z } from "zod";
import { installRequestSchema } from "../src/artifact_policy.js";
import { InfraiClient, InfraiError } from "../src/infrai.js";

const input = installRequestSchema.pick({ bucket: true }).extend({
  sweep_job_id: z.string().min(1),
}).parse({
  bucket: process.env.ARTIFACT_BUCKET,
  sweep_job_id: process.env.SWEEP_JOB_ID,
});

const client = new InfraiClient();
// Attempt both deletions even if one fails, and permit retry after partial cleanup.
const results = await Promise.allSettled([
  client.cron.delete(input.sweep_job_id),
  client.storage.bucket.delete(input.bucket),
]);
for (const result of results) {
  if (result.status === "rejected") {
    if (result.reason instanceof InfraiError && result.reason.status === 404) continue;
    throw result.reason;
  }
}
console.log(JSON.stringify({ bucket: input.bucket, sweep_job_id: input.sweep_job_id, deleted: true }));
