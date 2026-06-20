/**
 * OCAIS — Error types tests
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  OCAISError,
  OCAISAbortError,
  OCAISTimeoutError,
  OCAISParseError,
  OCAISToolError,
  OCAISProviderError,
} from "../dist/index.js";

describe("OCAIS error hierarchy", () => {
  test("all errors extend OCAISError", () => {
    const errors = [
      new OCAISAbortError(),
      new OCAISTimeoutError(1000, 1500),
      new OCAISParseError("bad json"),
      new OCAISToolError("myTool", "call_1", "fail"),
      new OCAISProviderError("openai", 500, "internal error"),
    ];
    for (const err of errors) {
      assert.ok(err instanceof OCAISError, `${err.constructor.name} should extend OCAISError`);
    }
  });

  test("OCAISAbortError has correct name and message", () => {
    const err = new OCAISAbortError("custom abort msg");
    assert.equal(err.name, "OCAISAbortError");
    assert.equal(err.message, "custom abort msg");
  });

  test("OCAISTimeoutError includes timeoutMs and elapsedMs", () => {
    const err = new OCAISTimeoutError(500, 750);
    assert.equal(err.name, "OCAISTimeoutError");
    assert.equal(err.timeoutMs, 500);
    assert.equal(err.elapsedMs, 750);
    assert.match(err.message, /750ms/);
    assert.match(err.message, /500ms/);
  });

  test("OCAISProviderError includes status and provider", () => {
    const err = new OCAISProviderError("openai", 429, "rate limited");
    assert.equal(err.name, "OCAISProviderError");
    assert.equal(err.status, 429);
    assert.equal(err.provider, "openai");
    assert.match(err.message, /429/);
  });

  test("errors are catchable as OCAISError", () => {
    try {
      throw new OCAISAbortError();
    } catch (e) {
      assert.ok(e instanceof OCAISError);
      assert.ok(e instanceof OCAISAbortError);
    }
  });
});
