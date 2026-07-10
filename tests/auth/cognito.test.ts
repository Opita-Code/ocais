/**
 * Tests for verifyCognitoJWT.
 *
 * Tests against the real Cognito JWKS endpoint for the opita-trabajos
 * user pool (us-east-1_LItAcj2Aa). No mock — real network calls.
 */

import { describe, it, before, after } from "node:test";
import * as assert from "node:assert/strict";
import {
  verifyCognitoJWT,
  _resetCache,
  _cacheStats,
  _refreshJWKS,
} from "../../src/auth/cognito.ts";
import { AuthTokenInvalidError, AuthTokenExpiredError } from "../../src/auth/errors.ts";

const REGION = "us-east-1";
const POOL_ID = "us-east-1_LItAcj2Aa";
const CLIENT_ID = "4b5sluoilcrtuq67qbu4528htl";

describe("cognito-auth", () => {
  before(async () => {
    _resetCache();
  });

  after(() => {
    _resetCache();
  });

  describe("JWKS fetch (real Cognito endpoint)", () => {
    it("should fetch and cache JWKS from Cognito", async () => {
      await _refreshJWKS(REGION, POOL_ID);
      const stats = _cacheStats();
      assert.ok(stats.poolCount >= 1, "should have at least 1 pool cached");
      assert.ok(stats.totalKeys >= 1, "should have at least 1 key");
      assert.equal(stats.pools[0].keyCount, 2, "our pool should have exactly 2 RSA keys");
    });

    it("should publish 2 RSA keys for our user pool", async () => {
      // Reuse cached JWKS from previous test
      const stats = _cacheStats();
      assert.equal(stats.pools[0].keyCount, 2, "expected 2 RSA keys");
    });

    it("should return correct JWK structure", async () => {
      const stats = _cacheStats();
      const pool = stats.pools[0];
      assert.ok(pool.keyCount >= 1, "should have keys");
      assert.equal(pool.region, REGION);
      assert.equal(pool.userPoolId, POOL_ID);
      assert.ok(pool.ageMs < 60000, "cache should be fresh (less than 1 min old)");
    });
  });

  describe("verifyCognitoJWT — edge cases", () => {
    it("should reject empty token", async () => {
      await assert.rejects(
        () => verifyCognitoJWT("", { region: REGION, userPoolId: POOL_ID }),
        /non-empty string/,
      );

      await assert.rejects(
        () => verifyCognitoJWT(null as unknown as string, { region: REGION, userPoolId: POOL_ID }),
        /non-empty string/,
      );
    });

    it("should reject garbage token", async () => {
      await assert.rejects(
        () => verifyCognitoJWT("not-a-jwt", { region: REGION, userPoolId: POOL_ID }),
        AuthTokenInvalidError,
      );
    });

    it("should reject malformed JWT (no signature)", async () => {
      const header = _b64(JSON.stringify({ alg: "RS256", kid: "test", typ: "JWT" }));
      const payload = _b64(JSON.stringify({ sub: "test", exp: 9999999999 }));
      const token = `${header}.${payload}`; // only 2 parts
      await assert.rejects(
        () => verifyCognitoJWT(token, { region: REGION, userPoolId: POOL_ID }),
        /must have 3 parts/,
      );
    });

    it("should reject HS256 token (must be RS256)", async () => {
      const header = _b64(JSON.stringify({ alg: "HS256", kid: "test", typ: "JWT" }));
      const payload = _b64(JSON.stringify({ sub: "test", exp: 9999999999 }));
      const token = `${header}.${payload}.fakesig`;
      await assert.rejects(
        () => verifyCognitoJWT(token, { region: REGION, userPoolId: POOL_ID }),
        /alg must be "RS256"/,
      );
    });

    it("should reject expired token without calling JWKS", async () => {
      // Valid RS256 structure but expired — should fail before JWKS fetch
      const header = _b64(JSON.stringify({ alg: "RS256", kid: "any-kid", typ: "JWT" }));
      const payload = _b64(JSON.stringify({
        sub: "test",
        exp: 1000000000, // epoch 2001
        iss: `https://cognito-idp.${REGION}.amazonaws.com/${POOL_ID}`,
      }));
      const token = `${header}.${payload}.fakesig_fakesig_fakesig_fakesig_fakesig_fakesig_fakesig_`;

      await assert.rejects(
        () => verifyCognitoJWT(token, { region: REGION, userPoolId: POOL_ID }),
        AuthTokenExpiredError,
        "expired token should be rejected",
      );
    });

    it("should reject token with wrong issuer", async () => {
      const header = _b64(JSON.stringify({ alg: "RS256", kid: "test", typ: "JWT" }));
      const payload = _b64(JSON.stringify({
        sub: "test",
        exp: 9999999999,
        iss: "https://cognito-idp.us-west-2.amazonaws.com/wrong-pool",
      }));
      const token = `${header}.${payload}.fakesig_fakesig_fakesig_fakesig_fakesig_fakesig_fakesig_`;

      await assert.rejects(
        () => verifyCognitoJWT(token, { region: REGION, userPoolId: POOL_ID }),
        /Issuer mismatch/,
      );
    });

    it("should reject token with wrong token_use", async () => {
      const header = _b64(JSON.stringify({ alg: "RS256", kid: "test", typ: "JWT" }));
      const payload = _b64(JSON.stringify({
        sub: "test",
        exp: 9999999999,
        token_use: "access",
      }));
      const token = `${header}.${payload}.fakesig`;

      await assert.rejects(
        () => verifyCognitoJWT(token, {
          region: REGION,
          userPoolId: POOL_ID,
          tokenUse: "id",
        }),
        /token_use mismatch/,
      );
    });
  });
});

function _b64(str: string): string {
  return globalThis.btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
