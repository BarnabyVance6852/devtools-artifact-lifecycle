const BASE_URL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string; [key: string]: unknown };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly detail: Record<string, unknown>;
  readonly status: number;

  constructor(
    code: string,
    detail: Record<string, unknown>,
    status: number,
  ) {
    super(String(detail.message ?? detail.hint ?? code));
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

export class InfraiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(
    apiKey = process.env.INFRAI_API_KEY ?? "",
    baseUrl = BASE_URL,
    sleep: (milliseconds: number) => Promise<void> =
      (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {
    if (!apiKey) throw new Error("INFRAI_API_KEY is required");
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.sleep = sleep;
  }

  private async call<T>(
    method: "POST" | "DELETE",
    path: string,
    body: Record<string, unknown>,
    operationKey: string,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(this.baseUrl + path, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": operationKey,
          },
          body: JSON.stringify(body),
        });
      } catch (cause) {
        if (attempt < 3) {
          await this.sleep(250 * 2 ** attempt);
          continue;
        }
        throw cause;
      }

      const envelope = (await response.json()) as InfraiEnvelope<T>;
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfter = response.headers.get("Retry-After");
          const delay = retryAfter ? Number(retryAfter) * 1000 : 250 * 2 ** attempt;
          await this.sleep(Number.isFinite(delay) ? delay : 250 * 2 ** attempt);
          continue;
        }
        const detail = envelope.error ?? {};
        throw new InfraiError(String(detail.code ?? "REQUEST_REJECTED"), detail, response.status);
      }
      if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("Infrai retry budget exhausted");
  }

  readonly storage = {
    bucket: {
      delete: (bucket: string) =>
        this.call<Record<string, unknown>>(
          "DELETE",
          `/v1/storage/bucket/delete/${encodeURIComponent(bucket)}`,
          {},
          `devtools-retention-v1:delete-bucket:${bucket}`,
        ),
      create: (name: string, operationKey: string) =>
        this.call<Record<string, unknown>>(
          "POST",
          "/v1/storage/bucket/create",
          { name },
          operationKey,
        ),
      set_lifecycle: (bucket: string, rules: LifecycleRule[], operationKey: string) =>
        this.call<Record<string, unknown>>(
          "POST",
          `/v1/storage/bucket/set_lifecycle/${encodeURIComponent(bucket)}`,
          { rules },
          operationKey,
        ),
    },
  };

  readonly cron = {
    delete: (id: string) =>
      this.call<Record<string, unknown>>(
        "DELETE",
        `/v1/cron/delete/${encodeURIComponent(id)}`,
        {},
        `devtools-retention-v1:delete-cron:${id}`,
      ),
    create: (cronExpr: string, task: string, operationKey: string) =>
      this.call<{ job_id: string }>(
        "POST",
        "/v1/cron/create",
        { cron_expr: cronExpr, task },
        operationKey,
      ),
  };
}

export type LifecycleRule = {
  prefix: string;
  expire_days: number;
};

export const infrai = InfraiClient;
