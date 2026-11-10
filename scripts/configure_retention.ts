import { installRequestSchema } from "../src/artifact_policy.js";
import { InfraiClient } from "../src/infrai.js";
import { installRetention } from "../src/install_retention.js";

const input = installRequestSchema.parse({
  bucket: process.env.ARTIFACT_BUCKET ?? "devtools-throwaway-builds",
  sweep_url: process.env.SWEEP_URL,
});

const result = await installRetention(input, new InfraiClient());
console.log(JSON.stringify(result, null, 2));
