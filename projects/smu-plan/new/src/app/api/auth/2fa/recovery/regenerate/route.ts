import { NextRequest } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";

import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import {
  decryptTwoFactorSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyTwoFactorTotp,
} from "@/lib/auth/two-factor";

const schema = z.object({
  password: z.string().min(1),
  code: z.string().min(6).max(12),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireUser(req);
    const body = await req.json();
    const data = schema.parse(body);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: {
        passwordHash: true,
        twoFactor: true,
      },
    });

    if (!user.twoFactor?.enabledAt) {
      return Response.json(
        { ok: false, error: { code: 400, message: "2FA 尚未启用" } },
        { status: 400 },
      );
    }

    const passwordValid = await compare(data.password, user.passwordHash);
    if (!passwordValid) {
      return Response.json(
        { ok: false, error: { code: 400, message: "当前密码不正确" } },
        { status: 400 },
      );
    }

    const secret = decryptTwoFactorSecret(user.twoFactor.secretCipher);
    const codeValid = verifyTwoFactorTotp(secret, data.code);
    if (!codeValid) {
      return Response.json(
        { ok: false, error: { code: 400, message: "验证码不正确" } },
        { status: 400 },
      );
    }

    const recoveryCodes = generateRecoveryCodes();

    await prisma.userTwoFactor.update({
      where: { userId: ctx.userId },
      data: {
        recoveryCodesHashJson: JSON.stringify(recoveryCodes.map(hashRecoveryCode)),
        lastUsedAt: new Date(),
      },
    });

    return Response.json({
      ok: true,
      data: {
        recoveryCodes,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: "请输入完整的密码和验证码" } },
        { status: 400 },
      );
    }
    return handleAuthError(err);
  }
}
