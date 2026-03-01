import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/guard";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireUser(req);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: {
        id: true,
        username: true,
        nickname: true,
        email: true,
        role: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });

    const [articleCount, messageCount, topicCount] = await Promise.all([
      prisma.article.count({ where: { authorId: ctx.userId } }),
      prisma.message.count({ where: { authorId: ctx.userId } }),
      prisma.bbsTopic.count({ where: { authorId: ctx.userId } }),
    ]);

    return Response.json({
      ok: true,
      data: {
        ...user,
        stats: { articles: articleCount, messages: messageCount, topics: topicCount },
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

const patchSchema = z.object({
  nickname: z.string().min(1).max(20),
});

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireUser(req);
    const body = await req.json();
    const data = patchSchema.parse(body);

    const user = await prisma.user.update({
      where: { id: ctx.userId },
      data: { nickname: data.nickname },
      select: { id: true, username: true, nickname: true },
    });

    return Response.json({ ok: true, data: user });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: "昵称长度1-20个字符" } },
        { status: 400 }
      );
    }
    return handleAuthError(err);
  }
}
