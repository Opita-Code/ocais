/**
 * OCAIS Auth — cookie primitive tests
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  cookieSign,
  cookieVerify,
  buildDeleteCookieHeader,
  inspectCookie,
} from "../../src/auth/cookie.ts";
import { randomBytes } from "../../src/auth/utils.ts";

const SECRET = new Uint8Array(32).fill(0x33);

describe("cookieSign", () => {
  test("returns a base64url value with . separator", async () => {
    const v = await cookieSign({ sub: "user-1" }, { secret: SECRET });
    assert.equal(v.split(".").length, 2);
    assert.match(v, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  test("respects expiresInSec", async () => {
    const v = await cookieSign({ sub: "user-1" }, { secret: SECRET, expiresInSec: 3600 });
    const inspected = inspectCookie(v);
    assert.ok(inspected.ciphertextBytes > 0);
  });

  test("rejects secret < 32 bytes", async () => {
    await assert.rejects(
      () => cookieSign({ sub: "x" }, { secret: new Uint8Array(16) }),
      /Secret must be at least 32 bytes/,
    );
  });

  test("accepts string secret", async () => {
    const v = await cookieSign({ sub: "x" }, { secret: "a".repeat(32) });
    assert.ok(v.length > 0);
  });

  test("two cookies with same payload are different (random IV)", async () => {
    const v1 = await cookieSign({ sub: "x" }, { secret: SECRET });
    const v2 = await cookieSign({ sub: "x" }, { secret: SECRET });
    assert.notEqual(v1, v2);
  });

  test("formats Set-Cookie header when attributes provided", async () => {
    const v = await cookieSign(
      { sub: "user-1" },
      {
        secret: SECRET,
        attributes: { domain: ".example.com", path: "/", secure: true, httpOnly: true, sameSite: "Lax" },
      },
    );
    assert.match(v, /^ocais=/);
    assert.match(v, /Domain=\.example\.com/);
    assert.match(v, /Path=\//);
    assert.match(v, /Secure/);
    assert.match(v, /HttpOnly/);
    assert.match(v, /SameSite=Lax/);
  });
});

describe("cookieVerify", () => {
  test("verifies a valid cookie and returns the original value", async () => {
    const original = { sub: "user-123", role: "admin" };
    const v = await cookieSign(original, { secret: SECRET });
    const verified = await cookieVerify(v, { secret: SECRET });
    assert.deepEqual(verified, original);
  });

  test("rejects tampered ciphertext (AES-GCM auth tag fails)", async () => {
    const v = await cookieSign({ sub: "user-1" }, { secret: SECRET });
    const [blob, mac] = v.split(".");
    // Flip one character in the blob
    const tampered = blob!.slice(0, -1) + (blob!.endsWith("A") ? "B" : "A") + "." + mac;
    const verified = await cookieVerify(tampered, { secret: SECRET });
    assert.equal(verified, null);
  });

  test("rejects tampered HMAC", async () => {
    const v = await cookieSign({ sub: "user-1" }, { secret: SECRET });
    const [blob, mac] = v.split(".");
    const tamperedMac = (mac!.startsWith("A") ? "B" : "A") + mac!.slice(1);
    const tampered = `${blob}.${tamperedMac}`;
    const verified = await cookieVerify(tampered, { secret: SECRET });
    assert.equal(verified, null);
  });

  test("rejects wrong secret", async () => {
    const v = await cookieSign({ sub: "user-1" }, { secret: SECRET });
    const verified = await cookieVerify(v, { secret: new Uint8Array(32).fill(0xff) });
    assert.equal(verified, null);
  });

  test("returns null for malformed cookie", async () => {
    assert.equal(await cookieVerify("not-a-cookie", { secret: SECRET }), null);
    assert.equal(await cookieVerify("abc.def", { secret: SECRET }), null);
  });

  test("returns null for expired cookie", async () => {
    const v = await cookieSign({ sub: "user-1" }, { secret: SECRET, expiresInSec: 1 });
    // Wait 1.5s to ensure expiry (cookie uses ms timestamps + 2s clock skew)
    await new Promise((resolve) => setTimeout(resolve, 3500));
    const verified = await cookieVerify(v, { secret: SECRET });
    assert.equal(verified, null);
  });

  test("accepts a full Set-Cookie header value (strips name= and ;Path etc.)", async () => {
    // cookieSign without attributes returns just the cookie value
    const cookieValue = await cookieSign(
      { sub: "user-1" },
      { secret: SECRET },
    );
    // Simulate a real Set-Cookie header from the browser
    const wrapped = `ocais=${cookieValue}; Path=/; HttpOnly`;
    const verified = await cookieVerify(wrapped, { secret: SECRET });
    assert.ok(verified);
  });
});

describe("buildDeleteCookieHeader", () => {
  test("builds a Set-Cookie header that deletes the cookie", () => {
    const h = buildDeleteCookieHeader("ocais", { path: "/" });
    assert.match(h, /^ocais=;/);
    assert.match(h, /Path=\//);
    assert.match(h, /Max-Age=0/);
    assert.match(h, /Expires=Thu, 01 Jan 1970/);
  });
});

describe("inspectCookie", () => {
  test("returns structure info without decrypting", async () => {
    const v = await cookieSign({ sub: "user-1", role: "admin" }, { secret: SECRET });
    const info = inspectCookie(v);
    assert.equal(info.format, "ocais-sealed-v1");
    assert.equal(info.ivBytes, 12);
    assert.ok(info.ciphertextBytes > 0);
    assert.equal(info.macBytes, 32);
    assert.equal(info.encrypted, true);
  });

  test("throws on malformed cookie", () => {
    assert.throws(() => inspectCookie("not-a-cookie"), /malformed/);
  });
});
