import type { MetadataRoute } from "next";

import { prisma } from "@/lib/prisma";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://nanyee.de";

const STATIC_ROUTES = [
  "",
  "/about",
  "/kb",
  "/links",
  "/guestbook",
  "/tools",
  "/tools/countdown",
  "/bbs",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await prisma.article.findMany({
    where: { status: "published" },
    select: { slug: true, updatedAt: true, publishedAt: true, createdAt: true },
    orderBy: { updatedAt: "desc" },
  });

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : route === "/kb" ? 0.9 : 0.7,
  }));

  const articleEntries: MetadataRoute.Sitemap = articles.map((article) => ({
    url: `${SITE_URL}/kb/${article.slug}`,
    lastModified: article.updatedAt || article.publishedAt || article.createdAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticEntries, ...articleEntries];
}
