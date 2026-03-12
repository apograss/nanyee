import { NextRequest } from "next/server";
import { z } from "zod";

import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import {
  deriveConversationTitle,
  parseConversationMessages,
  type StoredConversationMessage,
} from "@/lib/conversations";

const createConversationSchema = z.object({
  title: z.string().max(80).optional(),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["user", "ai"]),
      content: z.string(),
      references: z.array(z.any()).optional(),
      toolCards: z.array(z.any()).optional(),
    }),
  ).min(1),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);

    const conversations = await prisma.conversation.findMany({
      where: { userId: auth.userId },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        updatedAt: true,
      },
    });

    return Response.json({
      ok: true,
      data: {
        conversations: conversations.map((conversation) => ({
          id: conversation.id,
          title: conversation.title || "新的对话",
          updatedAt: conversation.updatedAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    const body = createConversationSchema.parse(await req.json());
    const messages = body.messages as StoredConversationMessage[];

    const conversation = await prisma.conversation.create({
      data: {
        userId: auth.userId,
        title: body.title?.trim() || deriveConversationTitle(messages),
        messagesJson: JSON.stringify(messages),
      },
      select: {
        id: true,
        title: true,
        messagesJson: true,
        updatedAt: true,
      },
    });

    return Response.json(
      {
        ok: true,
        data: {
          conversation: {
            id: conversation.id,
            title: conversation.title || "新的对话",
            messages: parseConversationMessages(conversation.messagesJson),
            updatedAt: conversation.updatedAt.toISOString(),
          },
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: error.errors[0]?.message || "请求参数错误" } },
        { status: 400 },
      );
    }
    return handleAuthError(error);
  }
}
