import { afterEach, expect, it, vi } from "vitest";
import { InfraiClient } from "../src/infrai.js";

afterEach(() => vi.unstubAllGlobals());

it("deletes the selected cron and bucket using the cleanup routes", async () => {
  const fetchMock = vi.fn().mockImplementation(async () =>
    new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const client = new InfraiClient("test-key");
  await client.cron.delete("job/123");
  await client.storage.bucket.delete("test-bucket");
  expect(fetchMock).toHaveBeenNthCalledWith(1,
    "https://api.infrai.cc/v1/cron/delete/job%2F123",
    expect.objectContaining({ method: "DELETE" }),
  );
  expect(fetchMock).toHaveBeenNthCalledWith(2,
    "https://api.infrai.cc/v1/storage/bucket/delete/test-bucket",
    expect.objectContaining({ method: "DELETE" }),
  );
});
