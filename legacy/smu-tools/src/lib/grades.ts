/**
 * Grades fetcher — fetch course grades and rankings from the academic system
 */

import { rankingLimiter } from "./rate-limiter";

const ZHJW_BASE = "https://zhjw.smu.edu.cn";

const HEADERS: Record<string, string> = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "Accept-Language": "zh-CN,zh;q=0.9",
    Host: "zhjw.smu.edu.cn",
    Referer: `${ZHJW_BASE}/`,
};

function buildCookieHeader(cookies: string[]): string {
    return cookies.map((c) => c.split(";")[0]).join("; ");
}

// ─── Types ────────────────────────────────────────────────────

export interface GradeRecord {
    kcmc: string;       // 课程名称
    kcywmc: string;     // 英文名
    zcj: string;        // 总成绩（原始：数字或等级）
    zcjfs: number;      // 总成绩（数值）
    cjjd: number;       // 绩点
    xf: number;         // 学分
    xdfsmc: string;     // 修读方式：必修/任选
    kcdlmc: string;     // 课程大类
    kcflmc: string;     // 课程分类
    xnxqmc: string;     // 学年学期
    cjfsmc: string;     // 成绩方式：百分制/五级制
    kkbmmc: string;     // 开课部门
    ksxzmc: string;     // 考试性质
    cjdm: string;       // 成绩代码（用于查排名）
    zxs: number;        // 总学时
    ranking?: RankingInfo;
}

export interface RankingInfo {
    courseRank: number;
    courseTotal: number;
    classRank: number;
    classTotal: number;
    distribution: {
        lt60: number;
        s60to70: number;
        s70to80: number;
        s80to90: number;
        gte90: number;
    };
}

export interface GradeSummary {
    totalCredits: number;
    totalCourses: number;
    weightedGpa: number;        // 加权 GPA
    requiredGpa: number;        // 必修 GPA
    averageScore: number;       // 加权平均分
    requiredAverageScore: number;
    failedCount: number;
    grades: GradeRecord[];
    semesters: string[];
}

/** Merge new cookies into existing ones (update existing, add new) */
function mergeCookies(existing: string[], incoming: string[]): string[] {
    const map = new Map<string, string>();
    for (const c of [...existing, ...incoming]) {
        const nameVal = c.split(";")[0];
        const name = nameVal.split("=")[0].trim();
        map.set(name, c);
    }
    return Array.from(map.values());
}

/** Extract Set-Cookie values from a Response */
function extractCookies(res: Response): string[] {
    return res.headers.getSetCookie?.() ?? [];
}

// ─── Fetch Grades ─────────────────────────────────────────────

/**
 * Get xnxqdm (semester code) from the schedule page — proven to work
 */
async function getXnxqdm(cookieHeader: string): Promise<string> {
    const res = await fetch(`${ZHJW_BASE}/new/student/xsgrkb/main.page`, {
        headers: {
            ...HEADERS,
            Cookie: cookieHeader,
            Accept: "text/html,application/xhtml+xml,*/*",
        },
    });
    const html = await res.text();
    console.log("[grades] schedule page status:", res.status, "length:", html.length);

    // Try multiple patterns to find xnxqdm
    const patterns = [
        /xnxqdm=(\d+)/,
        /xnxqdm["']\s*:\s*["'](\d+)/,
        /value="(\d{6})"/,     // semester codes are typically 6 digits like 202501
        /selected.*?value="(\d{6})"/,
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
            console.log("[grades] found xnxqdm:", match[1], "via pattern:", pattern.source);
            return match[1];
        }
    }

    // Dump some HTML for debugging
    console.error("[grades] could not find xnxqdm in schedule page. HTML snippet:", html.slice(0, 1000));
    throw new Error("无法获取学期代码，可能登录已过期");
}

export async function fetchGrades(cookies: string[]): Promise<GradeRecord[]> {
    let allCookies = [...cookies];
    console.log("[grades] initial cookie count:", allCookies.length);

    // Step 1: Get the semester code from schedule page (with cookie collection)
    const scheduleRes = await fetchWithCookies(
        `${ZHJW_BASE}/new/student/xsgrkb/main.page`,
        allCookies,
    );
    allCookies = scheduleRes.cookies;
    const scheduleHtml = await scheduleRes.response.text();

    const xnxqdmMatch = scheduleHtml.match(/xnxqdm=(\d+)/);
    if (!xnxqdmMatch) {
        console.error("[grades] could not find xnxqdm. HTML:", scheduleHtml.slice(0, 500));
        throw new Error("无法获取学期代码，可能登录已过期");
    }
    const xnxqdm = xnxqdmMatch[1];
    console.log("[grades] xnxqdm:", xnxqdm, "cookies now:", allCookies.length);

    // Step 2: Visit the grades page — MUST collect cookies from this response
    const gradesPageRes = await fetchWithCookies(
        `${ZHJW_BASE}/new/student/xskccj/kccjList.page`,
        allCookies,
    );
    allCookies = gradesPageRes.cookies;
    const pageHtml = await gradesPageRes.response.text();
    console.log("[grades] grades page status:", gradesPageRes.response.status, "length:", pageHtml.length);
    console.log("[grades] cookies after page visit:", allCookies.map(c => c.split(";")[0]).join(" | "));

    // Step 3: Fetch grades data
    // Match the EXACT request format from browser DevTools (Copy as cURL):
    // The WAF validates the complete request signature — all headers and body
    // fields must match what a real browser jQuery AJAX call sends.
    const cookieHeader = buildCookieHeader(allCookies);

    // Body params MUST match browser exactly (from DevTools capture)
    const body = [
        `xnxqdm=`,               // browser sends empty xnxqdm!
        `source=kccjlist`,       // REQUIRED by WAF — identifies the source page
        `ismax=1`,
        `primarySort=+cjdm+desc+`,  // spaces encoded as + (not %20)
        `page=1`,
        `rows=500`,              // request all (browser default is 20)
        `sort=xnxqdm%2Ckcmc`,    // comma-separated sort fields
        `order=desc%2Casc`,      // comma-separated sort orders
    ].join("&");

    console.log("[grades] POST kccjDatas body:", body);

    const dataRes = await fetch(`${ZHJW_BASE}/new/student/xskccj/kccjDatas`, {
        method: "POST",
        headers: {
            "User-Agent": HEADERS["User-Agent"],
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            Host: "zhjw.smu.edu.cn",
            Cookie: cookieHeader,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            Accept: "application/json, text/javascript, */*; q=0.01",
            Origin: ZHJW_BASE,
            Referer: `${ZHJW_BASE}/new/student/xskccj/kccjList.page`,
            "X-Requested-With": "XMLHttpRequest",
            Connection: "keep-alive",
            DNT: "1",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
        },
        body,
    });

    const text = await dataRes.text();
    console.log("[grades] data response status:", dataRes.status, "length:", text.length, "start:", text.slice(0, 120));

    // Check if we got JSON
    if (!text.startsWith("{") && !text.startsWith("[")) {
        console.error("[grades] non-JSON (500 chars):", text.slice(0, 500));
        throw new Error(`数据接口返回非JSON: ${text.slice(0, 150)}`);
    }




    let json;
    try {
        json = JSON.parse(text);
    } catch {
        throw new Error(`服务器返回了非预期格式: ${text.slice(0, 100)}`);
    }

    if (!json.rows || !Array.isArray(json.rows)) {
        throw new Error(`返回数据结构异常: ${JSON.stringify(json).slice(0, 200)}`);
    }

    return json.rows.map(
        (r: Record<string, string | number>): GradeRecord => ({
            kcmc: String(r.kcmc),
            kcywmc: String(r.kcywmc || ""),
            zcj: String(r.zcj),
            zcjfs: Number(r.zcjfs) || 0,
            cjjd: Number(r.cjjd) || 0,
            xf: Number(r.xf) || 0,
            xdfsmc: String(r.xdfsmc || ""),
            kcdlmc: String(r.kcdlmc || ""),
            kcflmc: String(r.kcflmc || ""),
            xnxqmc: String(r.xnxqmc || ""),
            cjfsmc: String(r.cjfsmc || ""),
            kkbmmc: String(r.kkbmmc || ""),
            ksxzmc: String(r.ksxzmc || ""),
            cjdm: String(r.cjdm || ""),
            zxs: Number(r.zxs) || 0,
        }),
    );
}

/**
 * Fetch a URL with manual redirect following to capture ALL cookies
 */
async function fetchWithCookies(
    url: string,
    cookies: string[],
): Promise<{ response: Response; cookies: string[] }> {
    let currentUrl = url;
    let allCookies = [...cookies];

    for (let i = 0; i < 8; i++) {
        const res = await fetch(currentUrl, {
            headers: {
                ...HEADERS,
                Cookie: buildCookieHeader(allCookies),
                Accept: "text/html,application/xhtml+xml,*/*",
            },
            redirect: "manual",
        });

        const newCookies = extractCookies(res);
        if (newCookies.length > 0) {
            console.log("[grades] new cookies from", currentUrl.split("/").pop(), ":", newCookies.map(c => c.split(";")[0]).join(" | "));
            allCookies = mergeCookies(allCookies, newCookies);
        }

        const location = res.headers.get("location");
        if (location && (res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307)) {
            currentUrl = location.startsWith("http")
                ? location
                : `${ZHJW_BASE}${location}`;
            continue;
        }

        return { response: res, cookies: allCookies };
    }

    throw new Error("重定向次数过多");
}


// ─── Fetch Ranking for a Single Course ────────────────────────

export async function fetchRanking(
    cookies: string[],
    cjdm: string,
): Promise<RankingInfo | null> {
    return rankingLimiter.run(async () => {
        try {
            const res = await fetch(
                `${ZHJW_BASE}/new/student/xskccj/kccjfxd.page?cjdm=${cjdm}`,
                {
                    headers: {
                        ...HEADERS,
                        Cookie: buildCookieHeader(cookies),
                        Accept: "text/html,application/xhtml+xml,*/*",
                    },
                },
            );

            const html = await res.text();
            return parseRankingHTML(html);
        } catch {
            return null;
        }
    });
}

/** Parse the ranking HTML table using regex */
function parseRankingHTML(html: string): RankingInfo | null {
    try {
        // Extract all <td> values
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const cells: string[] = [];
        let match;
        while ((match = tdRegex.exec(html)) !== null) {
            cells.push(match[1].trim());
        }

        // The table has 2 rows (课程 and 教学班), each with 8 columns:
        // 类型, 名称, <60, 60-70, 70-80, 80-90, >=90, 总人数, 排名
        // First row starts at index 0 (or after header)
        // We need at least 18 cells (2 rows × 9 columns)
        if (cells.length < 18) return null;

        // Find the row for "课程" (course-wide ranking)
        let courseRowStart = -1;
        let classRowStart = -1;
        for (let i = 0; i < cells.length; i++) {
            if (cells[i].includes("课程")) courseRowStart = i;
            if (cells[i].includes("教学班")) classRowStart = i;
        }

        if (courseRowStart === -1 || classRowStart === -1) return null;

        const parseRow = (start: number) => ({
            lt60: Number(cells[start + 2]) || 0,
            s60to70: Number(cells[start + 3]) || 0,
            s70to80: Number(cells[start + 4]) || 0,
            s80to90: Number(cells[start + 5]) || 0,
            gte90: Number(cells[start + 6]) || 0,
            total: Number(cells[start + 7]) || 0,
            rank: Number(cells[start + 8]) || 0,
        });

        const courseData = parseRow(courseRowStart);
        const classData = parseRow(classRowStart);

        return {
            courseRank: courseData.rank,
            courseTotal: courseData.total,
            classRank: classData.rank,
            classTotal: classData.total,
            distribution: {
                lt60: courseData.lt60,
                s60to70: courseData.s60to70,
                s70to80: courseData.s70to80,
                s80to90: courseData.s80to90,
                gte90: courseData.gte90,
            },
        };
    } catch {
        return null;
    }
}

// ─── Fetch All Rankings ───────────────────────────────────────

export async function fetchAllRankings(
    cookies: string[],
    grades: GradeRecord[],
): Promise<GradeRecord[]> {
    const results = [...grades];
    for (let i = 0; i < results.length; i++) {
        if (results[i].cjdm) {
            results[i].ranking =
                (await fetchRanking(cookies, results[i].cjdm)) ?? undefined;
        }
    }
    return results;
}

// ─── Calculate GPA Summary ────────────────────────────────────

export function calculateSummary(grades: GradeRecord[]): GradeSummary {
    let totalCredits = 0;
    let totalWeightedJd = 0;
    let totalWeightedScore = 0;
    let reqCredits = 0;
    let reqWeightedJd = 0;
    let reqWeightedScore = 0;
    let failedCount = 0;

    const semesters = new Set<string>();

    for (const g of grades) {
        semesters.add(g.xnxqmc);
        totalCredits += g.xf;
        totalWeightedJd += g.xf * g.cjjd;
        totalWeightedScore += g.xf * g.zcjfs;

        if (g.cjjd === 0 && g.zcjfs < 60) {
            failedCount++;
        }

        if (g.xdfsmc === "必修") {
            reqCredits += g.xf;
            reqWeightedJd += g.xf * g.cjjd;
            reqWeightedScore += g.xf * g.zcjfs;
        }
    }

    return {
        totalCredits,
        totalCourses: grades.length,
        weightedGpa: totalCredits > 0 ? totalWeightedJd / totalCredits : 0,
        requiredGpa: reqCredits > 0 ? reqWeightedJd / reqCredits : 0,
        averageScore: totalCredits > 0 ? totalWeightedScore / totalCredits : 0,
        requiredAverageScore:
            reqCredits > 0 ? reqWeightedScore / reqCredits : 0,
        failedCount,
        grades,
        semesters: Array.from(semesters).sort(),
    };
}
