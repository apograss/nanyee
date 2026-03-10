/**
 * Bootstrap Flarum Forum Migration
 *
 * Production-safe script to:
 * 1. Upsert Flarum OAuthClient
 * 2. Patch SiteSetting.navLinks to add external forum link
 * 3. Write AuditLog entry
 *
 * Usage:
 *   FLARUM_OIDC_CLIENT_ID=flarum-chat \
 *   FLARUM_OIDC_CLIENT_SECRET=your-secret \
 *   FLARUM_OIDC_REDIRECT_URI=https://chat.nanyee.de/auth/callback \
 *   npx tsx scripts/bootstrap-flarum-migration.ts
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const FORUM_URL = "https://chat.nanyee.de";

async function main() {
  const clientId = process.env.FLARUM_OIDC_CLIENT_ID || "flarum-chat";
  const clientSecret = process.env.FLARUM_OIDC_CLIENT_SECRET;
  const redirectUri =
    process.env.FLARUM_OIDC_REDIRECT_URI ||
    "https://chat.nanyee.de/auth/callback";
  const clientName = process.env.FLARUM_OIDC_NAME || "Flarum 论坛";

  console.log(`[Flarum Migration] Registering OAuthClient: ${clientId}`);

  const hashedSecret = clientSecret ? await hash(clientSecret, 12) : null;

  // 1. Upsert OAuthClient
  await prisma.oAuthClient.upsert({
    where: { clientId },
    create: {
      clientId,
      clientSecret: hashedSecret,
      name: clientName,
      redirectUris: JSON.stringify([redirectUri]),
      grants: JSON.stringify(["authorization_code"]),
      scopes: JSON.stringify(["openid", "profile", "email"]),
    },
    update: {
      clientSecret: hashedSecret,
      name: clientName,
      redirectUris: JSON.stringify([redirectUri]),
    },
  });
  console.log(`[Flarum Migration] OAuthClient upserted: ${clientId}`);

  // 2. Patch navLinks if present
  const navSetting = await prisma.siteSetting.findUnique({
    where: { key: "navLinks" },
  });

  if (navSetting) {
    try {
      const links = JSON.parse(navSetting.value);
      if (Array.isArray(links)) {
        // Check if forum link already exists
        const hasForumLink = links.some(
          (l: { href?: string }) =>
            l.href === FORUM_URL || l.href === "/bbs"
        );

        if (!hasForumLink) {
          // Insert after 知识库 (index 1 typically) or at position 2
          const insertIdx = Math.min(2, links.length);
          links.splice(insertIdx, 0, {
            href: FORUM_URL,
            label: "论坛",
            external: true,
          });
          await prisma.siteSetting.update({
            where: { key: "navLinks" },
            data: { value: JSON.stringify(links) },
          });
          console.log("[Flarum Migration] Added forum link to navLinks");
        } else {
          // Update existing /bbs link to external
          const updated = links.map(
            (l: { href?: string; label?: string; external?: boolean }) =>
              l.href === "/bbs"
                ? { href: FORUM_URL, label: "论坛", external: true }
                : l
          );
          await prisma.siteSetting.update({
            where: { key: "navLinks" },
            data: { value: JSON.stringify(updated) },
          });
          console.log("[Flarum Migration] Updated existing forum link");
        }
      }
    } catch {
      console.warn("[Flarum Migration] Could not parse navLinks, skipping");
    }
  } else {
    console.log(
      "[Flarum Migration] No navLinks setting found; Header default will show external forum link"
    );
  }

  // 3. Write AuditLog
  await prisma.auditLog.create({
    data: {
      action: "flarum.bootstrap",
      targetType: "OAuthClient",
      targetId: clientId,
      payload: JSON.stringify({ clientId, redirectUri, forumUrl: FORUM_URL }),
    },
  });
  console.log("[Flarum Migration] AuditLog written");

  console.log("[Flarum Migration] Done!");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[Flarum Migration] Error:", err);
  process.exit(1);
});
