import { NextRequest } from "next/server";

import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import {
  buildTwoFactorOtpAuthUri,
  buildTwoFactorQrCodeDataUrl,
  encryptTwoFactorSecret,
  generateTwoFactorSecret,
} from "@/lib/auth/two-factor";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireUser(req);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: {
        username: true,
        nickname: true,
        email: true,
        twoFactor: { select: { enabledAt: true } },
      },
    });

    if (user.twoFactor?.enabledAt) {
      return Response.json(
        { ok: false, error: { code: 409, message: "2FA 已经启用" } },
        { status: 409 },
      );
    }

    const secret = generateTwoFactorSecret();
    const accountLabel = user.email || user.username;
    const otpAuthUrl = buildTwoFactorOtpAuthUri(accountLabel, secret);
    const qrCodeDataUrl = await buildTwoFactorQrCodeDataUrl(otpAuthUrl);

    await prisma.userTwoFactor.upsert({
      where: { userId: ctx.userId },
      create: {
        userId: ctx.userId,
        secretCipher: encryptTwoFactorSecret(secret),
      },
      update: {
        secretCipher: encryptTwoFactorSecret(secret),
        enabledAt: null,
        recoveryCodesHashJson: null,
        lastUsedAt: null,
      },
    });

    return Response.json({
      ok: true,
      data: {
        otpAuthUrl,
        qrCodeDataUrl,
        manualEntryKey: secret,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
