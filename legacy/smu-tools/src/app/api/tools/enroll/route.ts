/**
 * POST /api/tools/enroll
 *
 * Actions:
 *   - categories: Get course enrollment categories
 *   - courses: Get available courses in a category
 *   - enroll: Start enrollment (returns SSE stream)
 */

import { NextRequest, NextResponse } from "next/server";
import { fullLogin } from "@/lib/smu-auth";
import { getSession, deleteSession } from "@/lib/session-store";
import {
    getCourseCategories,
    getCourseList,
    enrollJob,
    calibrateTime,
    computeRunAt,
    type CourseItem,
    type EnrollLogger,
} from "@/lib/course-enroll";

export const maxDuration = 300; // 5 minutes for enrollment

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action } = body;

        switch (action) {
            case "login":
                return handleLogin(body);
            case "categories":
                return handleCategories(body);
            case "courses":
                return handleCourses(body);
            case "enroll":
                return handleEnroll(body);
            default:
                return NextResponse.json({ error: "未知操作" }, { status: 400 });
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

// ─── Login ────────────────────────────────────────────────────

async function handleLogin(body: Record<string, unknown>) {
    const { account, password, captcha, sessionId } = body as {
        account: string;
        password: string;
        captcha: string;
        sessionId: string;
    };

    if (!account || !password || !captcha) {
        return NextResponse.json({ error: "请填写学号、密码和验证码" }, { status: 400 });
    }

    if (!sessionId) {
        return NextResponse.json({ error: "验证码会话已过期，请刷新验证码" }, { status: 400 });
    }

    const captchaCookies = getSession(sessionId);
    if (!captchaCookies) {
        return NextResponse.json({ error: "验证码已过期，请重新获取" }, { status: 400 });
    }

    const cookies = await fullLogin(account, password, captcha, captchaCookies);
    deleteSession(sessionId);
    return NextResponse.json({ cookies });
}


// ─── Categories ───────────────────────────────────────────────

async function handleCategories(body: Record<string, unknown>) {
    const { cookies } = body as { cookies: string[] };
    if (!cookies?.length) {
        return NextResponse.json({ error: "未提供 cookies" }, { status: 400 });
    }

    const categories = await getCourseCategories(cookies);
    return NextResponse.json({ categories });
}

// ─── Course List ──────────────────────────────────────────────

async function handleCourses(body: Record<string, unknown>) {
    const { cookies, categoryCode } = body as {
        cookies: string[];
        categoryCode: string;
    };

    if (!cookies?.length || !categoryCode) {
        return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    const { courses, categoryUrl } = await getCourseList(cookies, categoryCode);
    return NextResponse.json({ courses, categoryUrl });
}

// ─── Enrollment (SSE) ─────────────────────────────────────────

async function handleEnroll(body: Record<string, unknown>) {
    const {
        cookies,
        preferences,
        courses,
        categoryUrl,
        scheduledTime,
    } = body as {
        cookies: string[];
        preferences: (number | null)[];
        courses: CourseItem[];
        categoryUrl: string;
        scheduledTime?: string; // HH:MM:SS, optional
    };

    if (!cookies?.length || !preferences?.length || !courses?.length || !categoryUrl) {
        return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    // Use SSE for real-time progress
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: Record<string, unknown>) => {
                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
                );
            };

            try {
                // Step 1: Calibrate time
                send({ type: "calibrating", message: "正在校准服务器时间..." });
                const timeDiff = await calibrateTime(cookies);
                send({
                    type: "calibrating",
                    message: `时间校准完成，差值: ${(timeDiff / 1000).toFixed(3)}s`,
                });

                // Step 2: Wait for scheduled time (if provided)
                if (scheduledTime) {
                    const runAt = computeRunAt(scheduledTime, timeDiff);
                    const waitMs = runAt - Date.now();

                    if (waitMs > 0) {
                        send({
                            type: "waiting",
                            message: `将在 ${scheduledTime} 开始，等待 ${(waitMs / 1000).toFixed(1)}s...`,
                            waitMs,
                        });
                        // Wait in chunks to keep connection alive
                        const chunkMs = 5000;
                        let remaining = waitMs;
                        while (remaining > 0) {
                            const sleepMs = Math.min(remaining, chunkMs);
                            await new Promise((r) => setTimeout(r, sleepMs));
                            remaining -= sleepMs;
                            if (remaining > 0) {
                                send({
                                    type: "waiting",
                                    message: `等待中... 剩余 ${(remaining / 1000).toFixed(0)}s`,
                                });
                            }
                        }
                    }
                }

                // Step 3: Execute enrollment
                send({ type: "info", message: "开始抢课！" });

                const logger: EnrollLogger = (event) => {
                    send(event);
                };

                const result = await enrollJob(
                    preferences,
                    courses,
                    categoryUrl,
                    cookies,
                    logger,
                );

                send({
                    type: result.success ? "success" : "fail",
                    message: result.message,
                    course: result.courseName,
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                send({ type: "error", message: `错误: ${msg}` });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}
