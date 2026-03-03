import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { z } from "zod";

// GET /api/admin/links — list all links
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const links = await prisma.link.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    });

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
          createdAt: l.createdAt.toISOString(),
          updatedAt: l.updatedAt.toISOString(),
        })),
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

const createLinkSchema = z.object({
  title: z.string().min(1).max(200),
  url: z.string().url().max(2000),
  category: z.string().max(100).optional().default("general"),
  description: z.string().max(500).nullable().optional(),
  order: z.number().int().optional().default(0),
});

const renameCategorySchema = z.object({
  oldName: z.string().min(1).max(100),
  newName: z.string().min(1).max(100),
});

// PATCH /api/admin/links — rename a category (updates all links in that category)
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    const body = await req.json();
    const data = renameCategorySchema.parse(body);

    const result = await prisma.link.updateMany({
      where: { category: data.oldName },
      data: { category: data.newName },
    });

    await prisma.auditLog.create({
      data: {
        actorId: auth.userId,
        action: "link.rename_category",
        targetType: "link",
        payload: JSON.stringify({ oldName: data.oldName, newName: data.newName, count: result.count }),
      },
    });

    return Response.json({ ok: true, data: { updated: result.count } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: err.errors[0]?.message } },
        { status: 400 }
      );
    }
    return handleAuthError(err);
  }
}

// POST /api/admin/links — create a new link
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    const body = await req.json();
    const data = createLinkSchema.parse(body);

    const link = await prisma.link.create({
      data: {
        title: data.title,
        url: data.url,
        category: data.category,
        description: data.description,
        order: data.order,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: auth.userId,
        action: "link.create",
        targetType: "link",
        targetId: link.id,
        payload: JSON.stringify({ title: data.title, url: data.url }),
      },
    });

    return Response.json(
      {
        ok: true,
        data: {
          id: link.id,
          title: link.title,
          url: link.url,
          category: link.category,
          description: link.description,
          order: link.order,
          createdAt: link.createdAt.toISOString(),
          updatedAt: link.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: err.errors[0]?.message } },
        { status: 400 }
      );
    }
    return handleAuthError(err);
  }
}
