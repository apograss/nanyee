import { NextRequest } from "next/server";
import { z } from "zod";

import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import {
  deriveConversationTitle,
  parseConversationMessages,
  conversationMessageSchema,
  type StoredConversationMessage,
} from "@/lib/conversations";

const updateConversationSchema = z.object({
  title: z.string().max(80).optional(),
  messages: z.array(conversationMessageSchema).min(1),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser(req);
    const { id } = await params;

    const conversation = await prisma.conversation.findFirst({
      where: { id, userId: auth.userId },
      select: {
        id: true,
        title: true,
        messagesJson: true,
        updatedAt: true,
      },
    });

    if (!conversation) {
      return Response.json(
        { ok: false, error: { code: 404, message: "对话不存在" } },
        { status: 404 },
      );
    }

    return Response.json({
      ok: true,
      data: {
        conversation: {
          id: conversation.id,
          title: conversation.title || "新的对话",
          messages: parseConversationMessages(conversation.messagesJson),
          updatedAt: conversation.updatedAt.toISOString(),
        },
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser(req);
    const { id } = await params;
    const body = updateConversationSchema.parse(await req.json());
    const messages = body.messages as StoredConversationMessage[];

    const existing = await prisma.conversation.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true },
    });

    if (!existing) {
      return Response.json(
        { ok: false, error: { code: 404, message: "对话不存在" } },
        { status: 404 },
      );
    }

    const conversation = await prisma.conversation.update({
      where: { id },
      data: {
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

    return Response.json({
      ok: true,
      data: {
        conversation: {
          id: conversation.id,
          title: conversation.title || "新的对话",
          messages: parseConversationMessages(conversation.messagesJson),
          updatedAt: conversation.updatedAt.toISOString(),
        },
      },
    });
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser(req);
    const { id } = await params;

    const existing = await prisma.conversation.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true },
    });

    if (!existing) {
      return Response.json(
        { ok: false, error: { code: 404, message: "对话不存在" } },
        { status: 404 },
      );
    }

    await prisma.conversation.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (error) {
    return handleAuthError(error);
  }
}
