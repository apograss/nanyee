import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAuthContext } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

const feedbackSchema = z.object({
  sourcePage: z.string().min(1).max(64),
  imageBase64: z.string().startsWith("data:image/"),
  correctedText: z.string().trim().min(1).max(16),
  ocrText: z.string().trim().max(16).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const body = await req.json();
    const data = feedbackSchema.parse(body);

    const sample = await prisma.ocrSample.create({
      data: {
        sourcePage: data.sourcePage,
        imageBase64: data.imageBase64,
        correctedText: data.correctedText,
        ocrText: data.ocrText,
        userId: auth?.userId,
        ip: req.headers.get("x-forwarded-for") || undefined,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        sample: {
          id: sample.id,
          createdAt: sample.createdAt,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: { code: 400, message: "Invalid OCR feedback payload" } },
        { status: 400 },
      );
    }

    console.error("OCR feedback error:", error);
    return NextResponse.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 },
    );
  }
}
