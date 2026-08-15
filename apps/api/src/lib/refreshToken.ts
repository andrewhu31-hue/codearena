import { randomBytes, createHash } from "node:crypto";

/**
 * Refresh tokens are high-entropy random values, not JWTs: the server is
 * the only party that ever needs to validate them, and storing a SHA-256
 * digest (rather than bcrypt) is safe here because the token itself
 * supplies the entropy a password lacks — we only need fast equality
 * lookup, not brute-force resistance on a low-entropy secret.
 */
export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
