/**
 * POST /api/tools/grades
 *
 * Body: { sessionId, account, password, captcha }
 * Returns: { summary, grades[] } with ranking data
 */

import { NextRequest, NextResponse } from "next/server";
import { fullLogin } from "@/lib/smu-auth";
import { fetchGrades, fetchAllRankings, calculateSummary } from "@/lib/grades";
import { getSession, deleteSession } from "@/lib/session-store";
import { globalLimiter, checkStudentThrottle, recordStudentRequest } from "@/lib/rate-limiter";

export async function POST(request: NextRequest) {
    return globalLimiter.run(async () => {
        try {
            const body = await request.json();
            const { sessionId, account, password, captcha } = body as {
                sessionId: string;
                account: string;
                password: string;
                captcha: string;
            };

            if (!sessionId || !account || !password || !captcha) {
                return NextResponse.json(
                    { error: "请填写所有必填项" },
                    { status: 400 },
                );
            }

            // Check student-level throttle
            if (!checkStudentThrottle(account)) {
                return NextResponse.json(
                    { error: "请求过于频繁，请 10 分钟后再试" },
                    { status: 429 },
                );
            }

            const uisCookies = getSession(sessionId);
            if (!uisCookies) {
                return NextResponse.json(
                    { error: "验证码已过期，请刷新验证码重试" },
                    { status: 400 },
                );
            }
            deleteSession(sessionId);

            // Login
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

            // Record this student's request for throttling
            recordStudentRequest(account);

            // Fetch grades
            let grades;
            try {
                grades = await fetchGrades(zhjwCookies);
            } catch (err) {
                const msg = err instanceof Error ? err.message : "未知错误";
                return NextResponse.json(
                    { error: `获取成绩失败: ${msg}` },
                    { status: 500 },
                );
            }

            if (grades.length === 0) {
                return NextResponse.json(
                    { error: "未获取到成绩数据" },
                    { status: 404 },
                );
            }

            // Fetch rankings for all courses (with delays)
            const gradesWithRanking = await fetchAllRankings(zhjwCookies, grades);

            // Calculate summary
            const summary = calculateSummary(gradesWithRanking);

            return NextResponse.json(summary);
        } catch (error) {
            console.error("Grades fetch error:", error);
            return NextResponse.json(
                { error: "服务器内部错误，请稍后重试" },
                { status: 500 },
            );
        }
    });
}
