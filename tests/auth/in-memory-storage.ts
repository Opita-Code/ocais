/**
 * In-memory AuthStorage adapter for tests.
 *
 * NOT for production use. For production, implement AuthStorage with
 * DynamoDB, Redis, or another persistent backend.
 */

import type {
  AuthStorage,
  MagicLinkPayload,
  JWK,
} from "../types.ts";

interface StoredMagicLink {
  payload: MagicLinkPayload;
  expiresAt: number;
}

interface StoredKey {
  secretOrPrivate: Uint8Array;
  publicKey?: Uint8Array;
  active: boolean;
}

interface CounterState {
  count: number;
  resetAt: number;
}

export class InMemoryAuthStorage implements AuthStorage {
  private magicLinks = new Map<string, StoredMagicLink>();
  private keys = new Map<string, StoredKey>();
  private counters = new Map<string, CounterState>();
  private activeKeyId: string | null = null;
  private nowProvider: () => number = () => Date.now();

  /** Override the clock for deterministic tests. */
  setNowProvider(fn: () => number): void {
    this.nowProvider = fn;
  }

  /** Resets all data (useful between tests). */
  reset(): void {
    this.magicLinks.clear();
    this.keys.clear();
    this.counters.clear();
    this.activeKeyId = null;
    this.nowProvider = () => Date.now();
  }

  // ─── Magic-link ─────────────────────────────────────────────────────────

  async putMagicLink(
    token: string,
    payload: MagicLinkPayload,
    ttlMs: number,
  ): Promise<void> {
    this.magicLinks.set(token, {
      payload,
      expiresAt: this.nowProvider() + ttlMs,
    });
  }

  async getMagicLink(token: string): Promise<{ payload: MagicLinkPayload } | null> {
    const entry = this.magicLinks.get(token);
    if (!entry) return null;
    if (entry.expiresAt < this.nowProvider()) {
      this.magicLinks.delete(token); // Lazy cleanup
      return null;
    }
    return { payload: entry.payload };
  }

  async deleteMagicLink(token: string): Promise<void> {
    this.magicLinks.delete(token);
  }

  // ─── JWT keys ───────────────────────────────────────────────────────────

  async getActiveKeyId(): Promise<string> {
    if (!this.activeKeyId) {
      throw new Error("No active key set");
    }
    return this.activeKeyId;
  }

  async getKeyById(
    keyId: string,
  ): Promise<{ secretOrPrivate: Uint8Array; publicKey?: Uint8Array } | null> {
    const key = this.keys.get(keyId);
    if (!key) return null;
    return {
      secretOrPrivate: key.secretOrPrivate,
      publicKey: key.publicKey,
    };
  }

  async rotateKey(
    newKeyId: string,
    secretOrPrivate: Uint8Array,
    publicKey?: Uint8Array,
  ): Promise<void> {
    // Mark current active as deprecated
    if (this.activeKeyId && this.activeKeyId !== newKeyId) {
      const old = this.keys.get(this.activeKeyId);
      if (old) this.keys.set(this.activeKeyId, { ...old, active: false });
    }
    this.keys.set(newKeyId, {
      secretOrPrivate,
      publicKey,
      active: true,
    });
    this.activeKeyId = newKeyId;
  }

  async listKeyIds(): Promise<string[]> {
    return Array.from(this.keys.keys());
  }

  // ─── Rate limit ─────────────────────────────────────────────────────────

  async incrCounter(
    key: string,
    windowMs: number,
  ): Promise<{ count: number; resetAt: number }> {
    const now = this.nowProvider();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetAt = windowStart + windowMs;
    const existing = this.counters.get(key);
    if (!existing || existing.resetAt < now || existing.resetAt !== resetAt) {
      this.counters.set(key, { count: 1, resetAt });
      return { count: 1, resetAt };
    }
    existing.count += 1;
    return { count: existing.count, resetAt };
  }

  // ─── Test helpers ───────────────────────────────────────────────────────

  /** Sets a pre-existing key (for tests that want to skip the active key resolution). */
  setKey(keyId: string, secretOrPrivate: Uint8Array, publicKey?: Uint8Array): void {
    this.keys.set(keyId, {
      secretOrPrivate,
      publicKey,
      active: false,
    });
  }

  /** Marks a key as active. */
  setActiveKey(keyId: string): void {
    this.activeKeyId = keyId;
  }

  /** Returns the number of stored magic links. */
  magicLinkCount(): number {
    return this.magicLinks.size;
  }

  /** Returns the number of stored keys. */
  keyCount(): number {
    return this.keys.size;
  }
}
