import { describe, expect, it } from "vitest";
import { diagnoseArtifact, diagnosticRequestSchema } from "../src/artifact_policy.js";

describe("artifact retention decision", () => {
  it("expires a preview while retaining the same-age production release", () => {
    const build = {
      build_id: "build-482",
      artifact_key: "builds/preview/build-482.tar.gz",
      finished_at: "2026-01-01T00:00:00.000Z",
    };
    const base = {
      build,
      observed_at: "2026-01-03T00:00:00.000Z",
    };

    const preview = diagnosticRequestSchema.parse({
      ...base,
      release: { release_id: "rel-preview", build_id: build.build_id, channel: "preview" },
    });
    const production = diagnosticRequestSchema.parse({
      ...base,
      release: { release_id: "rel-prod", build_id: build.build_id, channel: "production" },
    });

    expect(diagnoseArtifact(preview).action).toBe("expire-now");
    expect(diagnoseArtifact(production).action).toBe("retain");
    expect(diagnoseArtifact(production)).toMatchObject({
      expires_at: "2026-01-31T00:00:00.000Z",
      channel: "production",
    });
  });
});
