import { prisma } from "@/lib/prisma";

/**
 * Delete expired OIDC authorization codes and access tokens.
 * Call periodically (e.g., from a cron job or health-check endpoint).
 */
export async function cleanupExpiredOidcData() {
  const now = new Date();

  const [codes, tokens] = await Promise.all([
    prisma.oidcCode.deleteMany({
      where: { expiresAt: { lt: now } },
    }),
    prisma.oidcToken.deleteMany({
      where: { expiresAt: { lt: now } },
    }),
  ]);

  return { deletedCodes: codes.count, deletedTokens: tokens.count };
}
