import crypto from "node:crypto";

const TOKEN_VERSION = "v1";

function authSecret() {
  return (
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    "palliative-home-visit-dev-secret"
  );
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [salt, expectedHash] = String(encoded ?? "").split(":");
  if (!salt || !expectedHash) return false;
  const actualHash = crypto.scryptSync(password, salt, 64).toString("hex");
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(actualHash, "hex");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function issueAuthToken(userId: string, expiresInHours = 12): string {
  const exp = Date.now() + expiresInHours * 60 * 60 * 1000;
  const payload = `${TOKEN_VERSION}.${userId}.${exp}`;
  const sig = crypto
    .createHmac("sha256", authSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyAuthToken(token: string): { userId: string; exp: number } | null {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 4) return null;
  const [version, userId, expText, sig] = parts;
  if (version !== TOKEN_VERSION || !userId || !expText || !sig) return null;
  const payload = `${version}.${userId}.${expText}`;
  const expectedSig = crypto
    .createHmac("sha256", authSecret())
    .update(payload)
    .digest("base64url");
  if (expectedSig !== sig) return null;
  const exp = Number.parseInt(expText, 10);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  return { userId, exp };
}
