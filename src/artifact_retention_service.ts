import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  diagnosticRequestSchema,
  diagnoseArtifact,
  installRequestSchema,
  lifecycleRules,
} from "./artifact_policy.js";
import { InfraiClient, InfraiError } from "./infrai.js";
import { installRetention } from "./install_retention.js";

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    if (request.method === "POST" && request.url === "/diagnostics") {
      const input = diagnosticRequestSchema.parse(await readJson(request));
      send(response, 200, diagnoseArtifact(input));
      return;
    }

    if (request.method === "POST" && request.url === "/admin/install-retention") {
      const input = installRequestSchema.parse(await readJson(request));
      send(response, 201, await installRetention(input, new InfraiClient()));
      return;
    }

    const sweepMatch = request.url?.match(/^\/internal\/lifecycle-sweep\/([^/?]+)$/);
    if (request.method === "POST" && sweepMatch) {
      const input = installRequestSchema
        .pick({ bucket: true })
        .parse({ bucket: decodeURIComponent(sweepMatch[1]) });
      await new InfraiClient().storage.bucket.set_lifecycle(
        input.bucket,
        lifecycleRules,
        `devtools-retention-v1:sweep:${input.bucket}`,
      );
      send(response, 200, { bucket: input.bucket, policy: "active", rule_count: lifecycleRules.length });
      return;
    }

    send(response, 404, { error: "route not found" });
  } catch (error) {
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.detail });
      return;
    }
    if (
      error instanceof SyntaxError ||
      (error instanceof Error && error.name === "ZodError")
    ) {
      send(response, 400, { error: "invalid request body" });
      return;
    }
    send(response, 500, { error: "request could not be completed" });
  }
}

const port = Number(process.env.PORT ?? 3000);
createServer((request, response) => void route(request, response)).listen(port, () => {
  console.log(`Artifact retention service listening on http://localhost:${port}`);
});
