import { NextRequest } from "next/server";

import { handleAuthError, requireAdmin } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

function toCsvRow(values: Array<string | number | null | undefined>) {
  return values
    .map((value) => {
      const normalized = value == null ? "" : String(value);
      return `"${normalized.replaceAll("\"", "\"\"")}"`;
    })
    .join(",");
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const format = url.searchParams.get("format");

    const samples = await prisma.ocrSample.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: {
          select: {
            username: true,
            nickname: true,
          },
        },
      },
    });

    if (format === "csv") {
      const rows = [
        toCsvRow(["id", "sourcePage", "correctedText", "ocrText", "author", "createdAt"]),
        ...samples.map((sample) =>
          toCsvRow([
            sample.id,
            sample.sourcePage,
            sample.correctedText,
            sample.ocrText,
            sample.user?.nickname || sample.user?.username || "",
            sample.createdAt.toISOString(),
          ]),
        ),
      ];

      return new Response(rows.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="ocr-dataset.csv"',
        },
      });
    }

    return Response.json({
      ok: true,
      data: {
        samples: samples.map((sample) => ({
          id: sample.id,
          sourcePage: sample.sourcePage,
          imageBase64: sample.imageBase64,
          correctedText: sample.correctedText,
          ocrText: sample.ocrText,
          authorName: sample.user?.nickname || sample.user?.username || "匿名",
          createdAt: sample.createdAt,
        })),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
