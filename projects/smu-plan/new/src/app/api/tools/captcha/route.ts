/**
 * GET /api/tools/captcha
 * Fetches a CAPTCHA from UIS and returns { sessionId, image }.
 * OCR is handled client-side via onnxruntime-web.
 */

import { NextResponse } from "next/server";
import { fetchCaptcha } from "@/lib/smu-auth";
import { createSession } from "@/lib/session-store";

export async function GET() {
    try {
        const { imageBase64, cookies } = await fetchCaptcha();
        const sessionId = createSession(cookies);

        return NextResponse.json({
            sessionId,
            image: imageBase64,
        });
    } catch (error) {
        console.error("Captcha fetch error:", error);
        return NextResponse.json(
            { error: "获取验证码失败，请刷新重试" },
            { status: 500 },
        );
    }
}
