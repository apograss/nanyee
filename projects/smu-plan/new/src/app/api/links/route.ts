import { prisma } from "@/lib/prisma";

// GET /api/links — public: return all links ordered by category + order
export async function GET() {
  try {
    const [links, catSetting] = await Promise.all([
      prisma.link.findMany({
        orderBy: [{ category: "asc" }, { order: "asc" }, { createdAt: "desc" }],
      }),
      prisma.siteSetting.findUnique({ where: { key: "linkCategories" } }),
    ]);

    // linkCategories is JSON: { "教务系统": { icon: "🎓", order: 0 }, ... }
    let categoryMeta: Record<string, { icon?: string; order?: number }> = {};
    if (catSetting?.value) {
      try { categoryMeta = JSON.parse(catSetting.value); } catch {}
    }

    return Response.json({
      ok: true,
      data: {
        links: links.map((l) => ({
          id: l.id,
          title: l.title,
          url: l.url,
          category: l.category,
          description: l.description,
          order: l.order,
        })),
        categoryMeta,
      },
    });
  } catch {
    return Response.json({ ok: true, data: { links: [], categoryMeta: {} } });
  }
}
