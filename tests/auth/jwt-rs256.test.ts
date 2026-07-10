/**
 * Tests for RS256 JWT operations (sign, verify, rotateKeys, jwksPublish).
 */

import { describe, it, before, after } from "node:test";
import * as assert from "node:assert/strict";
import { InMemoryAuthStorage } from "./in-memory-storage.ts";
import {
  signJWT,
  verifyJWT,
  rotateKeys,
  jwksPublish,
  rs256VerifyJWK,
} from "../../src/auth/jwt.ts";
import { AuthTokenInvalidError, AuthTokenExpiredError } from "../../src/auth/errors.ts";

describe("RS256 JWT", () => {
  let storage: InMemoryAuthStorage;

  before(async () => {
    storage = new InMemoryAuthStorage();
  });

  after(() => {
    storage.reset();
  });

  describe("rotateKeys", () => {
    it("should generate an RSA keypair", async () => {
      const result = await rotateKeys({ storage, alg: "RS256" });
      assert.ok(result.newKeyId, "should return a new key ID");
      assert.ok(result.newKeyId.startsWith("key-"), "key ID should start with key-");
      // First rotation: deprecatedKeyId is null (no prior key)
      assert.equal(result.deprecatedKeyId, null, "should have no deprecated key on first rotation");

      // Verify the key exists in storage
      const key = await storage.getKeyById(result.newKeyId);
      assert.ok(key, "key should exist in storage");
      assert.ok(key.secretOrPrivate, "should have private key bytes");
      assert.ok(key.secretOrPrivate.length >= 100, `private key should be > 100 bytes, got ${key.secretOrPrivate.length}`);
      assert.ok(key.publicKey, "should have public key bytes");
      assert.ok(key.publicKey.length >= 100, `public key should be > 100 bytes, got ${key.publicKey.length}`);
    });
  });

  describe("signJWT + verifyJWT", () => {
    it("should sign and verify a JWT with RS256", async () => {
      // Rotate to get an RSA key
      await rotateKeys({ storage, alg: "RS256" });
      const activeKeyId = await storage.getActiveKeyId();

      const { token } = await signJWT(
        { sub: "user-123", email: "test@example.com", customField: "hello" },
        { storage, alg: "RS256" },
      );

      assert.ok(token, "should produce a token");
      assert.equal(token.split(".").length, 3, "should have 3 parts");

      // Verify
      const claims = await verifyJWT(token, {
        storage,
        algorithms: ["RS256"],
      });

      assert.equal(claims.sub, "user-123");
      assert.equal(claims.email as string, "test@example.com");
      assert.equal(claims.customField as string, "hello");
      assert.ok(claims.iat, "should have iat");
      assert.ok(claims.exp, "should have exp");
      assert.ok(claims.jti, "should have jti");
    });

    it("should reject RS256 when algorithms list only has HS256", async () => {
      await rotateKeys({ storage, alg: "RS256" });
      const { token } = await signJWT(
        { sub: "user-123" },
        { storage, alg: "RS256" },
      );

      await assert.rejects(
        () => verifyJWT(token, { storage, algorithms: ["HS256"] }),
        AuthTokenInvalidError,
        "should reject RS256 when only HS256 is allowed",
      );
    });

    it("should reject expired RS256 JWT", async () => {
      await rotateKeys({ storage, alg: "RS256" });
      const { token } = await signJWT(
        { sub: "user-123", exp: 1 }, // expired in 1970
        { storage, alg: "RS256", expiresInSec: -999999 }, // force expired
      );

      await assert.rejects(
        () => verifyJWT(token, { storage, algorithms: ["RS256"] }),
        AuthTokenExpiredError,
        "should reject expired token",
      );
    });

    it("should reject tampered RS256 JWT", async () => {
      await rotateKeys({ storage, alg: "RS256" });
      const { token } = await signJWT(
        { sub: "user-123" },
        { storage, alg: "RS256" },
      );

      // Tamper with the payload
      const parts = token.split(".");
      parts[1] = btoa(JSON.stringify({ sub: "user-evil" }))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const tampered = parts.join(".");

      await assert.rejects(
        () => verifyJWT(tampered, { storage, algorithms: ["RS256"] }),
        AuthTokenInvalidError,
        "should reject tampered token",
      );
    });
  });

  describe("rs256VerifyJWK", () => {
    it("should verify RS256 signature using JWK format", async () => {
      // Use a direct RSA key test — no storage dependency
      const keyPair = await globalThis.crypto.subtle.generateKey(
        { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
        true,
        ["sign", "verify"],
      );
      const jwk = await globalThis.crypto.subtle.exportKey("jwk", keyPair.publicKey);

      // Sign data
      const data = new TextEncoder().encode("hello-rs256");
      const sig = new Uint8Array(
        await globalThis.crypto.subtle.sign(
          { name: "RSASSA-PKCS1-v1_5" },
          keyPair.privateKey,
          data,
        ),
      );

      // Verify with rs256VerifyJWK
      const signingInput = "hello-rs256";
      const valid = await rs256VerifyJWK(signingInput, sig, { n: jwk.n!, e: jwk.e! });
      assert.ok(valid, "JWK verification should succeed");
    });
  });

  describe("jwksPublish", () => {
    it("should return RSA JWK keys for RS256", async () => {
      await rotateKeys({ storage, alg: "RS256" });
      const jwks = await jwksPublish({ storage, alg: "RS256" });

      assert.ok(jwks.keys.length >= 1, "should have keys");
      for (const key of jwks.keys) {
        assert.equal(key.kty, "RSA");
        assert.equal(key.alg, "RS256");
        assert.equal(key.use, "sig");
        assert.ok(key.n, "RSA key should have modulus n");
        assert.ok(key.e, "RSA key should have exponent e");
      }
    });

    it("should return empty JWKS for HS256 (symmetric keys not exposed)", async () => {
      const jwks = await jwksPublish({ storage, alg: "HS256" });
      assert.equal(jwks.keys.length, 0, "HS256 should not expose keys");
    });
  });
});

// Base64url decode helper (matches the one in cognito.ts)
function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binaryStr = globalThis.atob(str);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}
