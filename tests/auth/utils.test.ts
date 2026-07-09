/**
 * OCAIS Auth — utility tests
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  randomBytes,
  randomBase64Url,
  base64UrlEncode,
  base64UrlDecode,
  constantTimeEqual,
  constantTimeEqualString,
  constantTimeEqualHex,
  hmacSha256,
  hmacSha256Verify,
  bytesToHex,
  hexToBytes,
  safeEqual,
} from "../../src/auth/utils.ts";

describe("randomBytes", () => {
  test("returns default 32 bytes when no arg", () => {
    const bytes = randomBytes();
    assert.equal(bytes.length, 32);
  });

  test("returns requested number of bytes", () => {
    assert.equal(randomBytes(16).length, 16);
    assert.equal(randomBytes(64).length, 64);
  });

  test("two consecutive calls produce different values", () => {
    const a = randomBytes(32);
    const b = randomBytes(32);
    assert.notDeepEqual(a, b);
  });
});

describe("randomBase64Url", () => {
  test("default 32 bytes → 43 chars (no padding)", () => {
    const s = randomBase64Url();
    assert.equal(s.length, 43);
    // base64url alphabet: A-Z, a-z, 0-9, -, _
    assert.match(s, /^[A-Za-z0-9_-]+$/);
  });

  test("32 bytes → 43 chars", () => {
    assert.equal(randomBase64Url(32).length, 43);
  });

  test("16 bytes → 22 chars", () => {
    assert.equal(randomBase64Url(16).length, 22);
  });
});

describe("base64UrlEncode + base64UrlDecode", () => {
  test("round-trip", () => {
    const original = new Uint8Array([0, 1, 2, 3, 254, 255]);
    const encoded = base64UrlEncode(original);
    const decoded = base64UrlDecode(encoded);
    assert.deepEqual(decoded, original);
  });

  test("no padding characters", () => {
    const encoded = base64UrlEncode(new Uint8Array(10));
    assert.ok(!encoded.includes("="));
  });
});

describe("constantTimeEqual", () => {
  test("returns true for equal arrays", () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 4]);
    assert.equal(constantTimeEqual(a, b), true);
  });

  test("returns false for different content", () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 5]);
    assert.equal(constantTimeEqual(a, b), false);
  });

  test("returns false for different lengths", () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3]);
    assert.equal(constantTimeEqual(a, b), false);
  });

  test("returns false for empty vs non-empty", () => {
    assert.equal(constantTimeEqual(new Uint8Array([]), new Uint8Array([0])), false);
  });
});

describe("constantTimeEqualString", () => {
  test("equal strings", () => {
    assert.equal(constantTimeEqualString("hello", "hello"), true);
  });

  test("different strings", () => {
    assert.equal(constantTimeEqualString("hello", "world"), false);
  });

  test("different lengths", () => {
    assert.equal(constantTimeEqualString("hello", "hell"), false);
  });
});

describe("hmacSha256", () => {
  test("RFC 4231 test case 1", async () => {
    // Key: 0x0b * 20, Data: "Hi There"
    const key = new Uint8Array(20).fill(0x0b);
    const data = new TextEncoder().encode("Hi There");
    const mac = await hmacSha256(key, data);
    assert.equal(
      bytesToHex(mac),
      "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
    );
  });

  test("RFC 4231 test case 2", async () => {
    // Key: "Jefe", Data: "what do ya want for nothing?"
    const key = new TextEncoder().encode("Jefe");
    const data = new TextEncoder().encode("what do ya want for nothing?");
    const mac = await hmacSha256(key, data);
    assert.equal(
      bytesToHex(mac),
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  test("accepts string key", async () => {
    const mac1 = await hmacSha256("secret", "data");
    const mac2 = await hmacSha256(new TextEncoder().encode("secret"), new TextEncoder().encode("data"));
    assert.deepEqual(mac1, mac2);
  });
});

describe("hmacSha256Verify", () => {
  test("verifies correct MAC", async () => {
    const key = "secret";
    const data = "data";
    const mac = await hmacSha256(key, data);
    const valid = await hmacSha256Verify(key, data, mac);
    assert.equal(valid, true);
  });

  test("rejects tampered MAC", async () => {
    const mac = await hmacSha256("secret", "data");
    const tampered = new Uint8Array(mac);
    tampered[0] ^= 0xff;
    const valid = await hmacSha256Verify("secret", "data", tampered);
    assert.equal(valid, false);
  });

  test("rejects wrong key", async () => {
    const mac = await hmacSha256("secret", "data");
    const valid = await hmacSha256Verify("wrong-secret", "data", mac);
    assert.equal(valid, false);
  });
});

describe("bytesToHex + hexToBytes", () => {
  test("round-trip", () => {
    const original = new Uint8Array([0, 1, 2, 3, 254, 255]);
    assert.deepEqual(hexToBytes(bytesToHex(original)), original);
  });

  test("lowercase hex output", () => {
    const hex = bytesToHex(new Uint8Array([0xab, 0xcd]));
    assert.equal(hex, "abcd");
  });

  test("rejects odd-length hex", () => {
    assert.throws(() => hexToBytes("abc"));
  });

  test("rejects invalid hex chars", () => {
    assert.throws(() => hexToBytes("zz"));
  });
});

describe("safeEqual", () => {
  test("equal strings", () => {
    assert.equal(safeEqual("abc", "abc"), true);
  });

  test("different strings", () => {
    assert.equal(safeEqual("abc", "abd"), false);
  });

  test("different lengths", () => {
    assert.equal(safeEqual("abc", "abcd"), false);
  });
});
