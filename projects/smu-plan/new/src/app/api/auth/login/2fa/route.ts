import { NextRequest } from "next/server";
import { z } from "zod";

import { issueUserSession } from "@/lib/auth/session";
import {
  consumeRecoveryCode,
  decryptTwoFactorSecret,
  verifyTwoFactorChallenge,
  verifyTwoFactorTotp,
} from "@/lib/auth/two-factor";
import { prisma } from "@/lib/prisma";
import { checkAuthRateLimit } from "@/lib/rate-limiter";

const schema = z.object({
  challengeId: z.string().min(1),
  code: z.string().min(6).max(32),
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { allowed, retryAfterMs } = checkAuthRateLimit(ip);
    if (!allowed) {
      return Response.json(
        { ok: false, error: { code: 429, message: "尝试过于频繁，请稍后再试" } },
        { status: 429, headers: { "Retry-After": String(Math.ceil((retryAfterMs || 60000) / 1000)) } },
      );
    }

    const body = await req.json();
    const data = schema.parse(body);
    const challenge = await verifyTwoFactorChallenge(data.challengeId);

    if (!challenge?.sub) {
      return Response.json(
        { ok: false, error: { code: 401, message: "二次验证已过期，请重新登录" } },
        { status: 401 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: challenge.sub },
      include: { twoFactor: true },
    });

    if (!user || user.status !== "active" || !user.twoFactor?.enabledAt) {
      return Response.json(
        { ok: false, error: { code: 401, message: "二次验证已失效，请重新登录" } },
        { status: 401 },
      );
    }

    const secret = decryptTwoFactorSecret(user.twoFactor.secretCipher);
    const trimmedCode = data.code.trim();
    let recoveryCodeConsumed = false;

    if (!verifyTwoFactorTotp(secret, trimmedCode)) {
      const recoveryResult = consumeRecoveryCode(
        user.twoFactor.recoveryCodesHashJson,
        trimmedCode,
      );

      if (!recoveryResult.matched) {
        return Response.json(
          { ok: false, error: { code: 400, message: "验证码或恢复码不正确" } },
          { status: 400 },
        );
      }

      recoveryCodeConsumed = true;
      await prisma.userTwoFactor.update({
        where: { userId: user.id },
        data: {
          recoveryCodesHashJson: recoveryResult.nextRecoveryCodesHashJson,
          lastUsedAt: new Date(),
        },
      });
    } else {
      await prisma.userTwoFactor.update({
        where: { userId: user.id },
        data: {
          lastUsedAt: new Date(),
        },
      });
    }

    return issueUserSession(req, user, {
      ok: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          role: user.role,
        },
        recoveryCodeConsumed,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: "请输入验证码或恢复码" } },
        { status: 400 },
      );
    }
    console.error("Login 2FA error:", err);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 },
    );
  }
}
