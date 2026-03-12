import { NextResponse } from "next/server";

const AI_VISION_MODEL = process.env.AI_VISION_MODEL?.trim() || "";

export async function GET() {
  return NextResponse.json({
    ok: true,
    data: {
      visionEnabled: Boolean(AI_VISION_MODEL),
    },
  });
}
