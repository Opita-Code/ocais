/**
 * OCAIS Auth — JWT primitive tests
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  signJWT,
  verifyJWT,
  rotateKeys,
  jwksPublish,
  decodeJWTUnsafe,
  nowSec,
  futureSec,
} from "../../src/auth/jwt.ts";
import { InMemoryAuthStorage } from "./in-memory-storage.ts";
import { randomBytes } from "../../src/auth/utils.ts";
import {
  AuthTokenInvalidError,
  AuthTokenExpiredError,
  AuthTokenNotYetValidError,
  AuthTokenAudienceError,
  AuthTokenIssuerError,
} from "../../src/auth/errors.ts";

describe("signJWT (HS256)", () => {
  let storage: InMemoryAuthStorage;

  beforeEach(() => {
    storage = new InMemoryAuthStorage();
  });

  test("returns compact JWT with 3 parts", async () => {
    const { token, keyId } = await signJWT(
      { sub: "user-123" },
      { storage, secret: new Uint8Array(32).fill(0x42) },
    );
    assert.equal(token.split(".").length, 3);
    assert.ok(keyId);
  });

  test("includes iat, exp, nbf, jti by default", async () => {
    const { token } = await signJWT(
      { sub: "user-123" },
      { storage, secret: new Uint8Array(32).fill(0x42) },
    );
    const { claims } = decodeJWTUnsafe(token);
    assert.ok(typeof claims.iat === "number");
    assert.ok(typeof claims.exp === "number");
    assert.ok(typeof claims.nbf === "number");
    assert.ok(typeof claims.jti === "string");
    assert.ok((claims.jti as string).length > 0);
  });

  test("rejects missing sub", async () => {
    await assert.rejects(
      () => signJWT({}, { storage, secret: new Uint8Array(32) }),
      /Missing required claim: sub/,
    );
  });

  test("does not validate exp (that's verifyJWT's job)", async () => {
    // signJWT is a pure signing function — it can produce tokens with any
    // claim shape, including exp in the past. verifyJWT rejects them.
    const { token } = await signJWT(
      { sub: "user-123", exp: 1 },
      { storage, secret: new Uint8Array(32) },
    );
    assert.ok(token.split(".").length === 3);
  });

  test("respects custom expiresInSec", async () => {
    const { token } = await signJWT(
      { sub: "user-123" },
      { storage, secret: new Uint8Array(32), expiresInSec: 3600 },
    );
    const { claims } = decodeJWTUnsafe(token);
    const lifetime = claims.exp! - claims.iat!;
    assert.equal(lifetime, 3600);
  });
});

describe("verifyJWT (HS256)", () => {
  let storage: InMemoryAuthStorage;
  const SECRET = new Uint8Array(32).fill(0x42);

  beforeEach(() => {
    storage = new InMemoryAuthStorage();
  });

  test("verifies a valid token and returns claims", async () => {
    const { token } = await signJWT(
      { sub: "user-123", iss: "https://app.com", aud: "api.app.com" },
      { storage, secret: SECRET },
    );
    const claims = await verifyJWT(token, {
      storage,
      secret: SECRET,
      audience: "api.app.com",
      issuer: "https://app.com",
    });
    assert.equal(claims.sub, "user-123");
  });

  test("rejects token signed with different secret", async () => {
    const { token } = await signJWT({ sub: "user-123" }, {
      storage,
      secret: new Uint8Array(32).fill(0x99),
    });
    await assert.rejects(
      () =>
        verifyJWT(token, {
          storage,
          secret: new Uint8Array(32).fill(0x42),
        }),
      (err: Error) => err instanceof AuthTokenInvalidError,
    );
  });

  test("rejects expired token", async () => {
    const { token } = await signJWT(
      { sub: "user-123", exp: nowSec() - 100 },
      { storage, secret: SECRET, expiresInSec: 1 },
    );
    await assert.rejects(
      () => verifyJWT(token, { storage, secret: SECRET }),
      (err: Error) => err instanceof AuthTokenExpiredError,
    );
  });

  test("accepts expired token when rejectExpired=false", async () => {
    const { token } = await signJWT(
      { sub: "user-123", exp: nowSec() - 100 },
      { storage, secret: SECRET, expiresInSec: 1 },
    );
    const claims = await verifyJWT(token, { storage, secret: SECRET, rejectExpired: false });
    assert.equal(claims.sub, "user-123");
  });

  test("rejects not-yet-valid token (nbf in future)", async () => {
    const { token } = await signJWT(
      { sub: "user-123" },
      { storage, secret: SECRET, notBeforeSec: 3600 },
    );
    await assert.rejects(
      () => verifyJWT(token, { storage, secret: SECRET }),
      (err: Error) => err instanceof AuthTokenNotYetValidError,
    );
  });

  test("rejects audience mismatch", async () => {
    const { token } = await signJWT(
      { sub: "user-123", aud: "api-A.com" },
      { storage, secret: SECRET },
    );
    await assert.rejects(
      () =>
        verifyJWT(token, {
          storage,
          secret: SECRET,
          audience: "api-B.com",
        }),
      (err: Error) => err instanceof AuthTokenAudienceError,
    );
  });

  test("rejects issuer mismatch", async () => {
    const { token } = await signJWT(
      { sub: "user-123", iss: "https://app-A.com" },
      { storage, secret: SECRET },
    );
    await assert.rejects(
      () =>
        verifyJWT(token, {
          storage,
          secret: SECRET,
          issuer: "https://app-B.com",
        }),
      (err: Error) => err instanceof AuthTokenIssuerError,
    );
  });

  test("rejects malformed token (not 3 parts)", async () => {
    await assert.rejects(
      () => verifyJWT("not-a-jwt", { storage }),
      (err: Error) => err instanceof AuthTokenInvalidError,
    );
  });

  test("rejects alg: 'none' token (forged)", async () => {
    // Manually craft a token with alg: none
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: "attacker", exp: nowSec() + 3600 })).toString("base64url");
    const forged = `${header}.${payload}.`;
    await assert.rejects(
      () => verifyJWT(forged, { storage }),
      (err: Error) => err instanceof AuthTokenInvalidError,
    );
  });

  test("never accepts 'none' in algorithms allow-list", async () => {
    await assert.rejects(
      () =>
        verifyJWT("eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.", {
          storage,
          algorithms: ["none" as never],
        }),
      /Algorithm 'none' is never allowed/,
    );
  });

  test("clockSkewSec allows slightly expired tokens", async () => {
    const { token } = await signJWT(
      { sub: "user-123", exp: nowSec() - 3 },
      { storage, secret: SECRET, expiresInSec: 1 },
    );
    // 3 sec in the past, with 5 sec tolerance → accepted
    const claims = await verifyJWT(token, { storage, secret: SECRET, clockSkewSec: 5 });
    assert.equal(claims.sub, "user-123");
  });
});

describe("rotateKeys", () => {
  let storage: InMemoryAuthStorage;

  beforeEach(() => {
    storage = new InMemoryAuthStorage();
  });

  test("generates new key and marks old as deprecated", async () => {
    // Pre-create an active key
    const oldKeyId = "initial-key";
    storage.setKey(oldKeyId, new Uint8Array(32).fill(0x11));
    storage.setActiveKey(oldKeyId);

    // Rotate
    const { newKeyId, deprecatedKeyId } = await rotateKeys({ storage });
    assert.notEqual(newKeyId, deprecatedKeyId);
    assert.equal(deprecatedKeyId, oldKeyId);
    // Old token still verifies (grace period)
    const { token: oldToken } = await signJWT(
      { sub: "user-1" },
      { storage, keyId: oldKeyId, secret: new Uint8Array(32).fill(0x11) },
    );
    const claims = await verifyJWT(oldToken, { storage });
    assert.equal(claims.sub, "user-1");
    // New tokens use new key
    const { token: newToken } = await signJWT({ sub: "user-2" }, { storage });
    const newClaims = await verifyJWT(newToken, { storage });
    assert.equal(newClaims.sub, "user-2");
  });
});

describe("jwksPublish (EdDSA — skipped when noble not installed)", () => {
  let storage: InMemoryAuthStorage;

  beforeEach(() => {
    storage = new InMemoryAuthStorage();
  });

  test("returns empty keys for HS256 (symmetric keys are NOT exposed)", async () => {
    // Set up an HS256 key
    const secret = randomBytes(32);
    const kid = "test-key";
    storage.setKey(kid, secret);
    storage.setActiveKey(kid);

    const jwks = await jwksPublish({ storage, alg: "HS256" });
    assert.deepEqual(jwks.keys, []);
  });
});
