import { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  buildUniqueWikiCategorySlug,
  canWriteWikiCategory,
} from "@/lib/wiki/categories";
import { handleAuthError, requireAdmin, requireUser } from "@/lib/auth/guard";

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  icon: z.string().max(8).optional().nullable(),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireUser(req);
    const body = await req.json();
    const data = updateSchema.parse(body);

    const category = await prisma.wikiCategory.findUnique({
      where: { id },
      select: { id: true, parentId: true },
    });

    if (!category) {
      return Response.json(
        { ok: false, error: { code: 404, message: "分类不存在" } },
        { status: 404 },
      );
    }

    if (!canWriteWikiCategory({ role: auth.role, parentId: category.parentId }, "update")) {
      return Response.json(
        { ok: false, error: { code: 403, message: "你没有权限编辑该分类" } },
        { status: 403 },
      );
    }

    if (
      auth.role !== "admin" &&
      (data.parentId !== undefined || data.sortOrder !== undefined)
    ) {
      return Response.json(
        { ok: false, error: { code: 403, message: "只有管理员可以调整分类结构" } },
        { status: 403 },
      );
    }

    let nextParentId = category.parentId;
    if (auth.role === "admin" && data.parentId !== undefined) {
      nextParentId = data.parentId ?? null;
      if (nextParentId) {
        const parent = await prisma.wikiCategory.findUnique({
          where: { id: nextParentId },
          select: { id: true, parentId: true },
        });
        if (!parent || parent.parentId) {
          return Response.json(
            { ok: false, error: { code: 400, message: "子分类只能挂在母项下面" } },
            { status: 400 },
          );
        }
      }
    }

    const slug = data.name
      ? await buildUniqueWikiCategorySlug(data.name, id)
      : undefined;

    const updated = await prisma.wikiCategory.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name.trim(), slug } : {}),
        ...(data.icon !== undefined ? { icon: data.icon?.trim() || null } : {}),
        ...(auth.role === "admin" && data.parentId !== undefined
          ? { parentId: nextParentId }
          : {}),
        ...(auth.role === "admin" && data.sortOrder !== undefined
          ? { sortOrder: data.sortOrder }
          : {}),
        updatedById: auth.userId,
      },
      include: {
        parent: {
          select: { id: true, name: true, slug: true, icon: true },
        },
      },
    });

    if (updated.parentId) {
      await prisma.article.updateMany({
        where: { categoryId: updated.id },
        data: { category: updated.name },
      });
    }

    return Response.json({
      ok: true,
      data: {
        category: {
          id: updated.id,
          name: updated.name,
          slug: updated.slug,
          icon: updated.icon,
          parentId: updated.parentId,
          parentName: updated.parent?.name ?? null,
          parentSlug: updated.parent?.slug ?? null,
          parentIcon: updated.parent?.icon ?? null,
          sortOrder: updated.sortOrder,
        },
      },
    });
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireAdmin(req);

    const category = await prisma.wikiCategory.findUnique({
      where: { id },
      select: { id: true, parentId: true, children: { select: { id: true } } },
    });

    if (!category) {
      return Response.json(
        { ok: false, error: { code: 404, message: "分类不存在" } },
        { status: 404 },
      );
    }

    if (!category.parentId && category.children.length > 0) {
      return Response.json(
        { ok: false, error: { code: 400, message: "请先处理母项下的子分类" } },
        { status: 400 },
      );
    }

    await prisma.article.updateMany({
      where: { categoryId: id },
      data: { categoryId: null, category: null },
    });
    await prisma.wikiCategory.delete({ where: { id } });

    return Response.json({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}
