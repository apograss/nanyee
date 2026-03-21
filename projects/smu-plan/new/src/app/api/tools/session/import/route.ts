import { NextRequest, NextResponse } from "next/server";

import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { createImportedSession } from "@/lib/session-store";

export async function POST(request: NextRequest) {
  try {
    await requireUser(request);

    const body = await request.json();
    const raw = String(body.cookiesText || "").trim();

    if (!raw) {
      return NextResponse.json(
        { ok: false, error: { message: "Cookie 不能为空" } },
        { status: 400 },
      );
    }

    let normalized = raw;
    if (normalized.toLowerCase().startsWith("cookie:")) {
      normalized = normalized.slice(7).trim();
    }
    normalized = normalized.replace(/^;+|;+$/g, "").trim();

    if (!normalized.includes("=") && !normalized.includes(";")) {
      normalized = `JSESSIONID=${normalized}`;
    }

    const cookies = normalized
      .split(";")
      .map((part: string) => part.trim())
      .filter(Boolean);

    if (cookies.length === 0) {
      return NextResponse.json(
        { ok: false, error: { message: "Cookie 格式无效" } },
        { status: 400 },
      );
    }

    const sessionId = createImportedSession(cookies);
    return NextResponse.json({ ok: true, data: { sessionId } });
  } catch (err) {
    return handleAuthError(err);
  }
}
