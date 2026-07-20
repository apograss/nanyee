/**
 * WakeUp schedule format export — TypeScript rewrite of export.py (WakeUp parts)
 */

import { AggregatedCourse } from "./schedule";
import { CampusType, getWakeUpTimetableJSON } from "./timetable";

const COLORS = [
    "#FF6B6B", "#FF9F43", "#FFC048", "#FFD93D", "#6BCB77",
    "#38A169", "#4ECDC4", "#1ABC9C", "#3498DB", "#2C82C9",
    "#6A5ACD", "#9B59B6", "#D980FA", "#E84393", "#FF7675",
    "#FFB8B8", "#A29BFE", "#00B894", "#0984E3", "#2D3436",
];

function shuffleArray<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * Generate the .wakeup_schedule file content
 */
export function generateWakeUpSchedule(
    courseMap: Map<string, number>,
    aggregatedCourses: AggregatedCourse[],
    startDate: string,   // "YYYY-M-D"
    totalWeeks: number,
    campus: CampusType,
): string {
    const lines: string[] = [];

    // Line 1: schedule settings
    lines.push(
        JSON.stringify({
            courseLen: 50,
            id: 1,
            name: "SMU",
            sameBreakLen: false,
            sameLen: true,
            theBreakLen: 10,
        }),
    );

    // Line 2: timetable
    lines.push(getWakeUpTimetableJSON(campus));

    // Line 3: table settings
    lines.push(
        JSON.stringify({
            background: "",
            courseTextColor: -1,
            id: 1,
            itemAlpha: 60,
            itemHeight: 64,
            itemTextSize: 12,
            maxWeek: totalWeeks,
            nodes: 11,
            showOtherWeekCourse: false,
            showSat: true,
            showSun: true,
            showTime: false,
            startDate,
            strokeColor: -2130706433,
            sundayFirst: false,
            tableName: `SMU-${startDate}`,
            textColor: -16777216,
            timeTable: 1,
            type: 0,
            widgetCourseTextColor: -1,
            widgetItemAlpha: 60,
            widgetItemHeight: 64,
            widgetItemTextSize: 12,
            widgetStrokeColor: -2130706433,
            widgetTextColor: -16777216,
        }),
    );

    // Line 4: courses
    const colors = shuffleArray(COLORS);
    const courseList = Array.from(courseMap.entries()).map(
        ([name, id], index) => ({
            color: colors[index % colors.length],
            courseName: name,
            credit: 0.0,
            id,
            note: "",
            tableId: 1,
        }),
    );
    lines.push(JSON.stringify(courseList));

    // Line 5: course time slots
    const timeSlots = aggregatedCourses.map((c) => ({
        day: c.xq,
        endTime: "",
        endWeek: c.weeks[c.weeks.length - 1],
        startWeek: c.weeks[0],
        id: c.id,
        level: 0,
        ownTime: false,
        room: c.jxcdmc,
        startNode: c.ps,
        startTime: "",
        step: c.pe - c.ps + 1,
        tableId: 1,
        teacher: c.teaxms,
        type: 0,
    }));
    lines.push(JSON.stringify(timeSlots));

    return lines.join("\n");
}

/**
 * Upload to WakeUp sharing service and get a share code
 */
export async function uploadToWakeUp(scheduleContent: string): Promise<string> {
    const res = await fetch("https://i.wakeup.fun/share_schedule", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            version: "180",
            "User-Agent": "okhttp/3.14.9",
        },
        body: new URLSearchParams({ schedule: scheduleContent }).toString(),
    });

    const json = await res.json();
    if (!json.data) {
        throw new Error("上传到 WakeUp 失败: " + JSON.stringify(json));
    }
    return json.data as string;
}
