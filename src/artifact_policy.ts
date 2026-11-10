import { z } from "zod";
import type { LifecycleRule } from "./infrai.js";

export const buildEventSchema = z.object({
  build_id: z.string().min(1),
  artifact_key: z.string().regex(/^builds\/[a-zA-Z0-9._/-]+$/),
  finished_at: z.string().datetime(),
});

export const releaseOperationSchema = z.object({
  release_id: z.string().min(1),
  build_id: z.string().min(1),
  channel: z.enum(["preview", "staging", "production"]),
});

export const diagnosticRequestSchema = z.object({
  build: buildEventSchema,
  release: releaseOperationSchema,
  observed_at: z.string().datetime(),
});

export const installRequestSchema = z.object({
  bucket: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
  sweep_url: z.string().url(),
});

export type DiagnosticRequest = z.infer<typeof diagnosticRequestSchema>;

const RETENTION_DAYS = {
  preview: 1,
  staging: 7,
  production: 30,
} as const;

export const lifecycleRules: LifecycleRule[] = [
  { prefix: "builds/preview/", expire_days: RETENTION_DAYS.preview },
  { prefix: "builds/staging/", expire_days: RETENTION_DAYS.staging },
  { prefix: "builds/production/", expire_days: RETENTION_DAYS.production },
];

export function diagnoseArtifact(request: DiagnosticRequest) {
  if (request.build.build_id !== request.release.build_id) {
    return {
      action: "release-mismatch" as const,
      message: `Release ${request.release.release_id} points at another build`,
    };
  }

  const retentionDays = RETENTION_DAYS[request.release.channel];
  const expiresAt = new Date(
    new Date(request.build.finished_at).getTime() + retentionDays * 86_400_000,
  );
  const expired = new Date(request.observed_at).getTime() >= expiresAt.getTime();

  return {
    action: expired ? ("expire-now" as const) : ("retain" as const),
    artifact_key: request.build.artifact_key,
    channel: request.release.channel,
    expires_at: expiresAt.toISOString(),
    message: expired
      ? `${request.build.artifact_key} has reached its ${retentionDays}-day window`
      : `${request.build.artifact_key} remains available until ${expiresAt.toISOString()}`,
  };
}
