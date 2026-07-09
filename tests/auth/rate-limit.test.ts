/**
 * OCAIS Auth — rate-limit primitive tests
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { rateLimit, createRateLimiter, _resetRateLimitStoreForTesting } from "../../src/auth/rate-limit.ts";
import { InMemoryAuthStorage } from "./in-memory-storage.ts";
import { AuthRateLimitError } from "../../src/auth/errors.ts";

describe("rateLimit (in-memory)", () => {
  beforeEach(() => {
    _resetRateLimitStoreForTesting();
  });

  test("first request is allowed", async () => {
    const r = await rateLimit({ key: "k1", max: 5, windowMs: 60_000 });
    assert.equal(r.allowed, true);
    assert.equal(r.remaining, 4);
  });

  test("subsequent requests within limit are allowed", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await rateLimit({ key: "k1", max: 5, windowMs: 60_000 });
      assert.equal(r.allowed, true);
    }
  });

  test("requests beyond limit are denied", async () => {
    for (let i = 0; i < 5; i++) {
      await rateLimit({ key: "k1", max: 5, windowMs: 60_000 });
    }
    const r = await rateLimit({ key: "k1", max: 5, windowMs: 60_000 });
    assert.equal(r.allowed, false);
    assert.equal(r.remaining, 0);
  });

  test("different keys are tracked independently", async () => {
    const r1 = await rateLimit({ key: "k1", max: 1, windowMs: 60_000 });
    const r2 = await rateLimit({ key: "k2", max: 1, windowMs: 60_000 });
    assert.equal(r1.allowed, true);
    assert.equal(r2.allowed, true);
  });

  test("rejects max < 1", async () => {
    await assert.rejects(
      () => rateLimit({ key: "k", max: 0, windowMs: 60_000 }),
      /max must be at least 1/,
    );
  });

  test("rejects windowMs < 1000", async () => {
    await assert.rejects(
      () => rateLimit({ key: "k", max: 5, windowMs: 500 }),
      /windowMs must be at least 1000/,
    );
  });

  test("resetAt is in the future", async () => {
    const r = await rateLimit({ key: "k", max: 5, windowMs: 60_000 });
    assert.ok(r.resetAt > Date.now());
  });
});

describe("rateLimit (with storage adapter)", () => {
  let storage: InMemoryAuthStorage;

  beforeEach(() => {
    _resetRateLimitStoreForTesting();
    storage = new InMemoryAuthStorage();
  });

  test("uses storage adapter when provided", async () => {
    const r = await rateLimit({ key: "k1", max: 3, windowMs: 60_000, storage });
    assert.equal(r.allowed, true);
    assert.equal(r.remaining, 2);
  });

  test("respects limit across multiple calls", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await rateLimit({ key: "k1", max: 3, windowMs: 60_000, storage });
      assert.equal(r.allowed, true);
    }
    const r = await rateLimit({ key: "k1", max: 3, windowMs: 60_000, storage });
    assert.equal(r.allowed, false);
  });

  test("fail-open on storage error", async () => {
    // Make storage throw
    const brokenStorage = {
      ...storage,
      incrCounter: async () => {
        throw new Error("DDB unavailable");
      },
    };
    const r = await rateLimit({
      key: "k1",
      max: 3,
      windowMs: 60_000,
      storage: brokenStorage,
    });
    // Fail-open: allow the request even though storage failed
    assert.equal(r.allowed, true);
  });
});

describe("createRateLimiter", () => {
  beforeEach(() => {
    _resetRateLimitStoreForTesting();
  });

  test("returns a reusable function", async () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000 });
    const r1 = await limiter("a");
    const r2 = await limiter("a");
    const r3 = await limiter("a");
    assert.equal(r1.allowed, true);
    assert.equal(r2.allowed, true);
    assert.equal(r3.allowed, false);
  });
});
