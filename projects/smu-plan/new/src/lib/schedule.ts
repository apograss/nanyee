/**
 * Schedule fetcher & aggregator — TypeScript rewrite of fetcher.py + aggregate.py
 */

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

// ─── Data Types ───────────────────────────────────────────────────

export interface SingleEvent {
    kcmc: string;    // 课程名称
    jxcdmc: string;  // 教室
    jxhjmc: string;  // 教学环节
    teaxms: string;  // 教师
    xq: number;      // 星期几 (1-7)
    xs: string;      // 学时
    qssj: string;    // 起始时间 "08:00"
    jssj: string;    // 结束时间 "09:40"
    ps: number;      // 开始节次
    pe: number;      // 结束节次
    zc: number;      // 周次
}

export interface AggregatedCourse {
    id: number;
    kcmc: string;
    jxcdmc: string;
    jxhjmc: string;
    teaxms: string;
    xq: number;
    xs: string;
    qssj: string;
    jssj: string;
    ps: number;
    pe: number;
    weeks: number[]; // 所有周次
}

// ─── Fetch Semester Code ──────────────────────────────────────────

export async function getSemesterCode(cookies: string[]): Promise<string> {
    const res = await fetch(`${ZHJW_BASE}/new/student/xsgrkb/main.page`, {
        headers: { ...HEADERS, Cookie: buildCookieHeader(cookies) },
    });
    const html = await res.text();

    const match = html.match(/xnxqdm=(\d+)/);
    if (!match) throw new Error("无法获取学期代码，可能登录已过期");
    return match[1];
}

// ─── Fetch Weekly Events ──────────────────────────────────────────

async function fetchWeek(
    cookies: string[],
    xnxqdm: string,
    week: number,
): Promise<SingleEvent[]> {
    const res = await fetch(
        `${ZHJW_BASE}/new/student/xsgrkb/getCalendarWeekDatas`,
        {
            method: "POST",
            headers: {
                ...HEADERS,
                Cookie: buildCookieHeader(cookies),
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ xnxqdm, zc: String(week) }).toString(),
        },
    );
    const json = await res.json();

    if (!json.data) return [];

    return json.data.map(
        (i: Record<string, string | number>): SingleEvent => ({
            kcmc: String(i.kcmc),
            jxcdmc: String(i.jxcdmc),
            jxhjmc: String(i.jxhjmc),
            teaxms: String(i.teaxms),
            xq: Number(i.xq),
            xs: String(i.xs),
            qssj: String(i.qssj).slice(0, 5), // "08:00:00" → "08:00"
            jssj: String(i.jssj).slice(0, 5),
            ps: Number(i.ps),
            pe: Number(i.pe),
            zc: Number(i.zc),
        }),
    );
}

/**
 * Fetch all events across weeks, concurrently in batches
 */
export async function fetchAllEvents(
    cookies: string[],
    xnxqdm: string,
    totalWeeks: number,
): Promise<SingleEvent[]> {
    const BATCH_SIZE = 5;
    const allEvents: SingleEvent[] = [];

    for (let start = 1; start <= totalWeeks; start += BATCH_SIZE) {
        const end = Math.min(start + BATCH_SIZE - 1, totalWeeks);
        const promises: Promise<SingleEvent[]>[] = [];
        for (let w = start; w <= end; w++) {
            promises.push(fetchWeek(cookies, xnxqdm, w));
        }
        const results = await Promise.all(promises);
        for (const events of results) {
            allEvents.push(...events);
        }
    }

    return allEvents;
}

// ─── Aggregate ────────────────────────────────────────────────────

type AggKey = string;

function makeKey(e: SingleEvent): AggKey {
    return `${e.kcmc}|${e.jxcdmc}|${e.jxhjmc}|${e.teaxms}|${e.ps}-${e.pe}|${e.xq}`;
}

export function aggregate(events: SingleEvent[]): {
    courseMap: Map<string, number>; // courseName → id
    courses: AggregatedCourse[];
} {
    const courseMap = new Map<string, number>();
    const groups = new Map<AggKey, AggregatedCourse>();
    let idCounter = 0;

    for (const e of events) {
        const key = makeKey(e);

        if (!courseMap.has(e.kcmc)) {
            courseMap.set(e.kcmc, idCounter++);
        }

        const existing = groups.get(key);
        if (existing) {
            existing.weeks.push(e.zc);
        } else {
            groups.set(key, {
                id: courseMap.get(e.kcmc)!,
                kcmc: e.kcmc,
                jxcdmc: e.jxcdmc,
                jxhjmc: e.jxhjmc,
                teaxms: e.teaxms,
                xq: e.xq,
                xs: e.xs,
                qssj: e.qssj,
                jssj: e.jssj,
                ps: e.ps,
                pe: e.pe,
                weeks: [e.zc],
            });
        }
    }

    // Sort weeks within each course
    for (const c of groups.values()) {
        c.weeks.sort((a, b) => a - b);
    }

    return { courseMap, courses: Array.from(groups.values()) };
}
