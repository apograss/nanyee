import { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  buildUniqueWikiCategorySlug,
  canWriteWikiCategory,
  listWikiCategoryTree,
} from "@/lib/wiki/categories";
import { handleAuthError, requireUser } from "@/lib/auth/guard";

export async function GET() {
  const categories = await listWikiCategoryTree();
  return Response.json({ ok: true, data: { categories } });
}

const createSchema = z.object({
  name: z.string().min(1).max(50),
  icon: z.string().max(8).optional().nullable(),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    const body = await req.json();
    const data = createSchema.parse(body);

    const parentId = data.parentId ?? null;
    if (!canWriteWikiCategory({ role: auth.role, parentId }, "create")) {
      return Response.json(
        { ok: false, error: { code: 403, message: "你没有权限创建该分类" } },
        { status: 403 },
      );
    }

    if (parentId) {
      const parent = await prisma.wikiCategory.findUnique({
        where: { id: parentId },
        select: { id: true, parentId: true },
      });
      if (!parent || parent.parentId) {
        return Response.json(
          { ok: false, error: { code: 400, message: "子分类只能创建在母项下面" } },
          { status: 400 },
        );
      }
    }

    const slug = await buildUniqueWikiCategorySlug(data.name);
    const sortOrder =
      data.sortOrder ??
      (await prisma.wikiCategory.count({ where: { parentId } }));

    const category = await prisma.wikiCategory.create({
      data: {
        name: data.name.trim(),
        slug,
        icon: data.icon?.trim() || null,
        parentId,
        sortOrder,
        createdById: auth.userId,
        updatedById: auth.userId,
      },
      include: {
        parent: {
          select: { id: true, name: true, slug: true, icon: true },
        },
      },
    });

    return Response.json(
      {
        ok: true,
        data: {
          category: {
            id: category.id,
            name: category.name,
            slug: category.slug,
            icon: category.icon,
            parentId: category.parentId,
            parentName: category.parent?.name ?? null,
            parentSlug: category.parent?.slug ?? null,
            parentIcon: category.parent?.icon ?? null,
            sortOrder: category.sortOrder,
          },
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: err.errors[0]?.message } },
        { status: 400 },
      );
    }
    return handleAuthError(err);
  }
}
