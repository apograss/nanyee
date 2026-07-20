/**
 * POST /api/tools/schedule
 *
 * Body: { sessionId, account, password, captcha, campus, format, startDate, totalWeeks }
 *
 * Returns:
 *   format=wakeup → { shareCode, message }
 *   format=ics    → ICS file download
 */

import { NextRequest, NextResponse } from "next/server";
import { fullLogin } from "@/lib/smu-auth";
import { fetchAllEvents, getSemesterCode, aggregate } from "@/lib/schedule";
import { generateWakeUpSchedule, uploadToWakeUp } from "@/lib/export-wakeup";
import { generateICS } from "@/lib/export-ics";
import { getSession, deleteSession } from "@/lib/session-store";
import { CampusType } from "@/lib/timetable";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            sessionId,
            account,
            password,
            captcha,
            campus = "shunde",
            format = "wakeup",
            startDate = "2026-3-2",
            totalWeeks = 20,
        } = body as {
            sessionId: string;
            account: string;
            password: string;
            captcha: string;
            campus?: CampusType;
            format?: "wakeup" | "ics";
            startDate?: string;
            totalWeeks?: number;
        };

        // Validate
        if (!sessionId || !account || !password || !captcha) {
            return NextResponse.json(
                { error: "请填写所有必填项" },
                { status: 400 },
            );
        }

        // Retrieve UIS cookies from session store
        const uisCookies = getSession(sessionId);
        if (!uisCookies) {
            return NextResponse.json(
                { error: "验证码已过期，请刷新验证码重试" },
                { status: 400 },
            );
        }

        // Clean up the session (one-time use)
        deleteSession(sessionId);

        // Step 1: Login
        let zhjwCookies: string[];
        try {
            zhjwCookies = await fullLogin(account, password, captcha, uisCookies);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "未知错误";
            return NextResponse.json(
                { error: `登录失败: ${msg}` },
                { status: 401 },
            );
        }

        // Step 2: Get semester code
        let xnxqdm: string;
        try {
            xnxqdm = await getSemesterCode(zhjwCookies);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "未知错误";
            return NextResponse.json(
                { error: `获取学期信息失败: ${msg}` },
                { status: 500 },
            );
        }

        // Step 3: Fetch events
        const events = await fetchAllEvents(zhjwCookies, xnxqdm, totalWeeks);
        if (events.length === 0) {
            return NextResponse.json(
                { error: "未获取到课表数据，可能是该学期暂无课程安排" },
                { status: 404 },
            );
        }

        // Step 4: Export
        if (format === "ics") {
            const icsContent = generateICS(events, startDate);
            return new NextResponse(icsContent, {
                headers: {
                    "Content-Type": "text/calendar; charset=utf-8",
                    "Content-Disposition": "attachment; filename=schedule.ics",
                },
            });
        }

        // Default: WakeUp format
        const { courseMap, courses } = aggregate(events);
        const scheduleContent = generateWakeUpSchedule(
            courseMap,
            courses,
            startDate,
            totalWeeks,
            campus,
        );

        // Upload to WakeUp and get share code
        let shareCode: string;
        try {
            shareCode = await uploadToWakeUp(scheduleContent);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "未知错误";
            return NextResponse.json(
                { error: `课表生成成功，但上传到 WakeUp 失败: ${msg}` },
                { status: 500 },
            );
        }

        const shareMessage = `这是来自「WakeUp课程表」的课表分享，30分钟内有效哦。请复制这条消息后，打开App的主界面，右上角第二个按钮 -> 从分享口令导入，按操作提示即可完成导入~分享口令为「${shareCode}」`;

        return NextResponse.json({
            shareCode,
            shareMessage,
            courseCount: courseMap.size,
            eventCount: events.length,
        });
    } catch (error) {
        console.error("Schedule export error:", error);
        return NextResponse.json(
            { error: "服务器内部错误，请稍后重试" },
            { status: 500 },
        );
    }
}
