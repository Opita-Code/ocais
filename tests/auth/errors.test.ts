/**
 * OCAIS Auth — error hierarchy tests
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  AuthError,
  AuthMagicLinkInvalidError,
  AuthTokenInvalidError,
  AuthTokenExpiredError,
  AuthTokenNotYetValidError,
  AuthTokenAudienceError,
  AuthTokenIssuerError,
  AuthCookieInvalidError,
  AuthPasswordInvalidError,
  AuthRateLimitError,
  AuthStorageError,
  AuthKeyError,
  isAuthError,
} from "../../src/auth/errors.ts";

describe("AuthError hierarchy", () => {
  test("all auth errors extend AuthError", () => {
    const err = new AuthError("X", "msg");
    assert.ok(err instanceof AuthError);
    assert.ok(err instanceof Error);
    assert.equal(err.code, "X");
    assert.equal(err.message, "msg");
  });

  test("AuthTokenExpiredError carries expiredAt", () => {
    const err = new AuthTokenExpiredError(1234567890);
    assert.ok(err instanceof AuthTokenExpiredError);
    assert.ok(err instanceof AuthError);
    assert.equal(err.expiredAt, 1234567890);
    assert.equal(err.code, "AUTH_TOKEN_EXPIRED");
  });

  test("AuthTokenNotYetValidError carries notBefore", () => {
    const err = new AuthTokenNotYetValidError(1234567890);
    assert.equal(err.notBefore, 1234567890);
  });

  test("AuthTokenAudienceError carries expected/actual", () => {
    const err = new AuthTokenAudienceError("api.com", "wrong.com");
    assert.equal(err.expected, "api.com");
    assert.equal(err.actual, "wrong.com");
  });

  test("AuthTokenIssuerError carries expected/actual", () => {
    const err = new AuthTokenIssuerError("https://app.com", "https://attacker.com");
    assert.equal(err.expected, "https://app.com");
    assert.equal(err.actual, "https://attacker.com");
  });

  test("AuthPasswordInvalidError has generic message (no user enumeration)", () => {
    const err = new AuthPasswordInvalidError();
    assert.equal(err.code, "AUTH_PASSWORD_INVALID");
    // The default message MUST NOT reveal whether the email exists
    assert.ok(err.message.includes("Invalid"));
  });

  test("AuthRateLimitError carries retry info", () => {
    const err = new AuthRateLimitError("key", 5, 30000);
    assert.equal(err.key, "key");
    assert.equal(err.limit, 5);
    assert.equal(err.retryAfterMs, 30000);
  });
});

describe("isAuthError", () => {
  test("returns true for AuthError and subclasses", () => {
    assert.equal(isAuthError(new AuthError("X", "m")), true);
    assert.equal(isAuthError(new AuthTokenInvalidError("m")), true);
    assert.equal(isAuthError(new AuthCookieInvalidError("m")), true);
  });

  test("returns false for non-AuthError values", () => {
    assert.equal(isAuthError(new Error("plain")), false);
    assert.equal(isAuthError("string"), false);
    assert.equal(isAuthError(null), false);
    assert.equal(isAuthError(undefined), false);
    assert.equal(isAuthError({ code: "X" }), false);
  });
});

describe("error causes are preserved", () => {
  test("cause is set and accessible", () => {
    const originalError = new Error("DDB throttled");
    const wrapped = new AuthStorageError("Storage failed", originalError);
    assert.equal(wrapped.cause, originalError);
  });
});
