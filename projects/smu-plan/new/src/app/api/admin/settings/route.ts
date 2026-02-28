import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { z } from "zod";

// GET /api/admin/settings — get all site settings as key-value map
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const rows = await prisma.siteSetting.findMany();
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    return Response.json({
      ok: true,
      data: { settings },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

const ALLOWED_KEYS = [
  "site_name",
  "site_description",
  "homepage_announcement",
  "default_ai_model",
];

const updateSettingsSchema = z
  .record(z.string(), z.string().max(5000))
  .refine(
    (obj) => Object.keys(obj).every((key) => ALLOWED_KEYS.includes(key)),
    { message: "Unknown setting key" }
  );

// PATCH /api/admin/settings — update site settings (upsert each key)
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    const body = await req.json();
    const data = updateSettingsSchema.parse(body);

    // Upsert each setting
    await Promise.all(
      Object.entries(data).map(([key, value]) =>
        prisma.siteSetting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        })
      )
    );

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: auth.userId,
        action: "settings.update",
        targetType: "siteSetting",
        payload: JSON.stringify(data),
      },
    });

    return Response.json({ ok: true });
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
