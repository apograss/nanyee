import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { revokeOtherSessions } from "@/lib/auth/session";
import { verifyRefreshToken } from "@/lib/auth/jwt";

const schema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6).max(100),
  revokeOtherSessions: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireUser(req);
    const body = await req.json();
    const data = schema.parse(body);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { passwordHash: true },
    });

    const valid = await compare(data.oldPassword, user.passwordHash);
    if (!valid) {
      return Response.json(
        { ok: false, error: { code: 400, message: "旧密码不正确" } },
        { status: 400 }
      );
    }

    const passwordHash = await hash(data.newPassword, 10);
    await prisma.user.update({
      where: { id: ctx.userId },
      data: { passwordHash },
    });

    let revokedCount = 0;
    if (data.revokeOtherSessions) {
      const refreshToken = req.cookies.get("refresh_token")?.value;
      const payload = refreshToken ? await verifyRefreshToken(refreshToken) : null;
      if (payload?.sid) {
        revokedCount = await revokeOtherSessions(
          ctx.userId,
          payload.sid,
          "password_changed"
        );
      }
    }

    return Response.json({
      ok: true,
      data: { message: "密码修改成功", revokedCount },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: "新密码至少6个字符" } },
        { status: 400 }
      );
    }
    return handleAuthError(err);
  }
}
