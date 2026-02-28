import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";

/**
 * Verify an API token from the Authorization header.
 * Returns the ApiToken record if valid, null otherwise.
 */
export async function verifyApiToken(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const tokenHash = hashToken(token);

  const apiToken = await prisma.apiToken.findFirst({
    where: {
      tokenHash,
      status: "active",
    },
  });

  if (!apiToken) return null;

  // Check expiry
  if (apiToken.expiresAt && apiToken.expiresAt < new Date()) {
    return null;
  }

  // Update lastUsedAt (fire-and-forget)
  prisma.apiToken
    .update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return apiToken;
}

/**
 * Check if a model is allowed for this token.
 */
export function isModelAllowed(apiToken: { allowedModels: string | null }, model: string): boolean {
  if (!apiToken.allowedModels) return true; // null = all models allowed
  const allowed: string[] = JSON.parse(apiToken.allowedModels);
  return allowed.length === 0 || allowed.includes(model);
}

/**
 * Hash a token for storage/lookup.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a new API token string.
 * Format: nyk-<random32chars>
 */
export function generateToken(): { token: string; prefix: string; hash: string } {
  const { randomBytes } = require("crypto") as typeof import("crypto");
  const bytes = randomBytes(24);
  const token = `nyk-${bytes.toString("base64url")}`;
  const prefix = token.slice(0, 12);
  const hash = hashToken(token);
  return { token, prefix, hash };
}

/**
 * Record token usage.
 */
export async function recordTokenUsage(params: {
  apiTokenId: string;
  endpoint: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  success: boolean;
  errorCode?: string;
  responseMs?: number;
  clientIp?: string;
  userAgent?: string;
  requestId?: string;
}) {
  await prisma.tokenUsage.create({ data: params });
}
