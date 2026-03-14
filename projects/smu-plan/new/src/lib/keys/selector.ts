import { prisma } from "@/lib/prisma";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const KEY_ENCRYPTION_SECRET = process.env.KEY_ENCRYPTION_SECRET || "";
const AI_API_KEY_FALLBACK = process.env.AI_API_KEY || "";
const FORCE_ENV_KEY = process.env.AI_FORCE_ENV_KEY === "true";

/**
 * Select a ProviderKey using weighted random for load balancing.
 * Only active keys within their limits are selected.
 * Falls back to AI_API_KEY env var if no database keys are available.
 *
 * When AI_FORCE_ENV_KEY=true, always use the env var key (useful when
 * switching to New API gateway and wanting to bypass DB keys).
 */
export async function selectProviderKey(): Promise<{
  id: string;
  apiKey: string;
} | null> {
  if (FORCE_ENV_KEY && AI_API_KEY_FALLBACK) {
    return { id: "env-fallback", apiKey: AI_API_KEY_FALLBACK };
  }

  const keys = await prisma.providerKey.findMany({
    where: { status: "active" },
  });

  if (keys.length === 0) {
    // Fallback to env var
    if (AI_API_KEY_FALLBACK) {
      return { id: "env-fallback", apiKey: AI_API_KEY_FALLBACK };
    }
    return null;
  }

  // Check daily usage limits
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Batch query: get today's usage counts for all keys that have a dailyLimit
  const keysWithLimit = keys.filter((k) => k.dailyLimit);
  const keysWithLimitIds = keysWithLimit.map((k) => k.id);

  const usageCounts =
    keysWithLimitIds.length > 0
      ? await prisma.keyUsage.groupBy({
          by: ["providerKeyId"],
          where: {
            providerKeyId: { in: keysWithLimitIds },
            createdAt: { gte: todayStart },
          },
          _count: { providerKeyId: true },
        })
      : [];

  const usageMap = new Map(
    usageCounts.map((u) => [u.providerKeyId, u._count.providerKeyId]),
  );

  const usable = keys.filter((key) => {
    if (key.dailyLimit) {
      const todayUsage = usageMap.get(key.id) ?? 0;
      if (todayUsage >= key.dailyLimit) return false;
    }
    return true;
  });

  if (usable.length === 0) return null;

  // Weighted random selection
  const totalWeight = usable.reduce((sum, k) => sum + k.weight, 0);
  let rand = Math.random() * totalWeight;

  for (const key of usable) {
    rand -= key.weight;
    if (rand <= 0) {
      const apiKey = decryptKey(key.keyCipher);
      return { id: key.id, apiKey };
    }
  }

  // Fallback to first
  const fallback = usable[0];
  return { id: fallback.id, apiKey: decryptKey(fallback.keyCipher) };
}

/**
 * Record a key usage event.
 */
export async function recordKeyUsage(params: {
  providerKeyId: string;
  apiTokenId?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs?: number;
  success: boolean;
  errorCode?: string;
  requestId?: string;
}) {
  // Skip recording for env fallback key (no real DB row)
  if (params.providerKeyId === "env-fallback") return;
  await prisma.keyUsage.create({ data: params });
}

/**
 * Decrypt an AES-256-GCM encrypted key.
 * Format: iv:authTag:ciphertext (all hex)
 */
function decryptKey(cipher: string): string {
  if (!KEY_ENCRYPTION_SECRET) {
    throw new Error(
      "KEY_ENCRYPTION_SECRET env var is required for key decryption",
    );
  }

  const parts = cipher.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid cipher format");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = Buffer.from(KEY_ENCRYPTION_SECRET, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

/**
 * Encrypt an API key with AES-256-GCM.
 */
export function encryptKey(plaintext: string): string {
  if (!KEY_ENCRYPTION_SECRET) {
    throw new Error(
      "KEY_ENCRYPTION_SECRET env var is required for key encryption",
    );
  }

  const key = Buffer.from(KEY_ENCRYPTION_SECRET, "hex");
  const iv = randomBytes(12);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}
