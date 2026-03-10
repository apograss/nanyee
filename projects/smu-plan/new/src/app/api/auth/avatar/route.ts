import { NextRequest } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { validateFile, saveFile, deleteFile, AVATAR_RULES, UploadError } from "@/lib/upload";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireUser(req);

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return Response.json(
        { ok: false, error: { code: 400, message: "缺少文件" } },
        { status: 400 }
      );
    }

    validateFile(file, AVATAR_RULES);

    const current = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { avatarUrl: true },
    });

    const avatarUrl = await saveFile(file, "avatars");

    try {
      const user = await prisma.user.update({
        where: { id: ctx.userId },
        data: { avatarUrl },
        select: { id: true, username: true, nickname: true, avatarUrl: true },
      });

      // Clean up old avatar after successful DB update
      await deleteFile(current?.avatarUrl);

      return Response.json({ ok: true, data: { avatarUrl, user } });
    } catch (dbErr) {
      // Rollback: delete newly uploaded file if DB update fails
      await deleteFile(avatarUrl);
      throw dbErr;
    }
  } catch (err) {
    if (err instanceof UploadError) {
      return Response.json(
        { ok: false, error: { code: err.status, message: err.message } },
        { status: err.status }
      );
    }
    return handleAuthError(err);
  }
}
