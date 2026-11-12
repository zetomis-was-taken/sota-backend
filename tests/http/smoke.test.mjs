import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getConfig, supabaseFetch } from "./client.mjs";

describe("Supabase local HTTP surface smoke checks", () => {
  it("has required environment configuration", () => {
    const { url, anonKey } = getConfig();
    assert.ok(url.startsWith("http"), "SUPABASE_URL must be an HTTP(S) URL");
    assert.ok(anonKey.length > 0, "SUPABASE_ANON_KEY must be non-empty");
  });

  it("responds on /auth/v1/health", async () => {
    const res = await supabaseFetch("/auth/v1/health");
    assert.equal(res.status, 200);
  });

  it("responds on /rest/v1/ with anon key", async () => {
    const res = await supabaseFetch("/rest/v1/");
    assert.equal(res.status, 200);
  });

  it("responds on /storage/v1/ public object endpoint", async () => {
    const res = await supabaseFetch(
      "/storage/v1/object/public/museum-media/__smoke_nonexistent__"
    );
    assert.ok(
      res.status === 400 || res.status === 404,
      `Expected 400 or 404 from /storage/v1, got ${res.status}`
    );
  });
});
