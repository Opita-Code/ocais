/**
 * OCAIS Auth — magic-link primitive tests
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { magicLinkRequest, magicLinkVerify } from "../../src/auth/magic-link.ts";
import { InMemoryAuthStorage } from "./in-memory-storage.ts";
import {
  AuthMagicLinkInvalidError,
  AuthRateLimitError,
  AuthStorageError,
} from "../../src/auth/errors.ts";

const SECRET = "test-secret-32-bytes-long-12345";

describe("magicLinkRequest", () => {
  let storage: InMemoryAuthStorage;

  beforeEach(() => {
    storage = new InMemoryAuthStorage();
  });

  test("returns token and expiresAt", async () => {
    const { token, expiresAt } = await magicLinkRequest(
      { email: "user@example.com", redirectTo: "https://app.example.com" },
      { storage, secret: SECRET },
    );
    assert.equal(typeof token, "string");
    assert.ok(token.length >= 16);
    assert.ok(expiresAt > Date.now());
  });

  test("stores payload in storage", async () => {
    const { token } = await magicLinkRequest(
      { email: "user@example.com", redirectTo: "https://app.example.com" },
      { storage, secret: SECRET },
    );
    assert.equal(storage.magicLinkCount(), 1);
  });

  test("throws AuthRateLimitError on second request for same email within window", async () => {
    await magicLinkRequest(
      { email: "user@example.com", redirectTo: "https://app.example.com" },
      { storage, secret: SECRET, rateLimitMs: 60_000 },
    );
    await assert.rejects(
      () =>
        magicLinkRequest(
          { email: "user@example.com", redirectTo: "https://app.example.com" },
          { storage, secret: SECRET, rateLimitMs: 60_000 },
        ),
      (err: Error) => {
        assert.ok(err instanceof AuthRateLimitError);
        return true;
      },
    );
  });

  test("different emails have independent rate limits", async () => {
    await magicLinkRequest(
      { email: "alice@example.com", redirectTo: "https://app.example.com" },
      { storage, secret: SECRET, rateLimitMs: 60_000 },
    );
    const { token } = await magicLinkRequest(
      { email: "bob@example.com", redirectTo: "https://app.example.com" },
      { storage, secret: SECRET, rateLimitMs: 60_000 },
    );
    assert.ok(token.length > 0);
  });

  test("respects custom ttlMs", async () => {
    const { expiresAt } = await magicLinkRequest(
      { email: "user@example.com", redirectTo: "https://app.example.com" },
      { storage, secret: SECRET, ttlMs: 60_000 },
    );
    const diff = expiresAt - Date.now();
    assert.ok(diff >= 59_000 && diff <= 61_000);
  });

  test("rejects ttlMs < 60_000", async () => {
    await assert.rejects(
      () =>
        magicLinkRequest(
          { email: "user@example.com", redirectTo: "https://app.example.com" },
          { storage, secret: SECRET, ttlMs: 30_000 },
        ),
      /ttlMs must be at least 60_000/,
    );
  });

  test("rejects rateLimitMs < 1000", async () => {
    await assert.rejects(
      () =>
        magicLinkRequest(
          { email: "user@example.com", redirectTo: "https://app.example.com" },
          { storage, secret: SECRET, rateLimitMs: 500 },
        ),
      /rateLimitMs must be at least 1000/,
    );
  });

  test("rejects tokenBytes < 16", async () => {
    await assert.rejects(
      () =>
        magicLinkRequest(
          { email: "user@example.com", redirectTo: "https://app.example.com" },
          { storage, secret: SECRET, tokenBytes: 8 },
        ),
      /tokenBytes must be at least 16/,
    );
  });

  test("generated token is unique across requests", async () => {
    const { token: t1 } = await magicLinkRequest(
      { email: "user1@example.com", redirectTo: "https://app.example.com" },
      { storage, secret: SECRET, rateLimitMs: 60_000 },
    );
    const { token: t2 } = await magicLinkRequest(
      { email: "user2@example.com", redirectTo: "https://app.example.com" },
      { storage, secret: SECRET, rateLimitMs: 60_000 },
    );
    assert.notEqual(t1, t2);
  });
});

describe("magicLinkVerify", () => {
  let storage: InMemoryAuthStorage;

  beforeEach(() => {
    storage = new InMemoryAuthStorage();
  });

  test("returns the original payload", async () => {
    const { token } = await magicLinkRequest(
      { email: "user@example.com", redirectTo: "https://app.example.com" },
      { storage, secret: SECRET },
    );
    const payload = await magicLinkVerify({ token }, { storage, secret: SECRET });
    assert.ok(payload);
    assert.equal(payload!.email, "user@example.com");
    assert.equal(payload!.redirectTo, "https://app.example.com");
  });

  test("token is single-use (deleted after verify)", async () => {
    const { token } = await magicLinkRequest(
      { email: "user@example.com", redirectTo: "https://app.example.com" },
      { storage, secret: SECRET },
    );
    await magicLinkVerify({ token }, { storage, secret: SECRET });
    const payload2 = await magicLinkVerify({ token }, { storage, secret: SECRET });
    assert.equal(payload2, null);
  });

  test("returns null for unknown token", async () => {
    const payload = await magicLinkVerify(
      { token: "nonexistent-token-32-bytes-padding-padding" },
      { storage, secret: SECRET },
    );
    assert.equal(payload, null);
  });

  test("throws AuthMagicLinkInvalidError for too-short token", async () => {
    await assert.rejects(
      () => magicLinkVerify({ token: "abc" }, { storage, secret: SECRET }),
      (err: Error) => err instanceof AuthMagicLinkInvalidError,
    );
  });

  test("rejects when storage is missing the token", async () => {
    const payload = await magicLinkVerify(
      { token: "a".repeat(40) },
      { storage, secret: SECRET },
    );
    assert.equal(payload, null);
  });
});
