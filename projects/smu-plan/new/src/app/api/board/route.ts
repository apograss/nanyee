import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { z } from "zod";

// GET /api/board — list messages
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || "20")));

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { author: { select: { username: true, nickname: true } } },
    }),
    prisma.message.count(),
  ]);

  return Response.json({
    ok: true,
    data: {
      messages: messages.map((m) => ({
        id: m.id,
        content: m.content,
        author: m.author.nickname || m.author.username,
        createdAt: m.createdAt.toISOString(),
      })),
      pagination: { page, limit, total },
    },
  });
}

const messageSchema = z.object({
  content: z.string().min(1).max(500),
});

// POST /api/board — post a message
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    const body = await req.json();
    const { content } = messageSchema.parse(body);

    const message = await prisma.message.create({
      data: {
        content,
        authorId: auth.userId,
      },
      include: { author: { select: { username: true, nickname: true } } },
    });

    return Response.json(
      {
        ok: true,
        data: {
          id: message.id,
          content: message.content,
          author: message.author.nickname || message.author.username,
          createdAt: message.createdAt.toISOString(),
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
