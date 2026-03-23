import { NextRequest } from "next/server";
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
  code: z.string().min(6).max(12),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireUser(req);
    const body = await req.json();
    const data = schema.parse(body);

    const record = await prisma.userTwoFactor.findUnique({
      where: { userId: ctx.userId },
    });

    if (!record) {
      return Response.json(
        { ok: false, error: { code: 404, message: "请先生成验证器二维码" } },
        { status: 404 },
      );
    }

    const secret = decryptTwoFactorSecret(record.secretCipher);
    const valid = verifyTwoFactorTotp(secret, data.code);

    if (!valid) {
      return Response.json(
        { ok: false, error: { code: 400, message: "验证码不正确" } },
        { status: 400 },
      );
    }

    const recoveryCodes = generateRecoveryCodes();
    const hashedRecoveryCodes = recoveryCodes.map(hashRecoveryCode);

    await prisma.userTwoFactor.update({
      where: { userId: ctx.userId },
      data: {
        enabledAt: new Date(),
        lastUsedAt: new Date(),
        recoveryCodesHashJson: JSON.stringify(hashedRecoveryCodes),
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
        { ok: false, error: { code: 400, message: "请输入 6 位验证码" } },
        { status: 400 },
      );
    }
    return handleAuthError(err);
  }
}
