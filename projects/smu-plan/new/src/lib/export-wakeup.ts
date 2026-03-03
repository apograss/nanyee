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
 * Split a sorted array of week numbers into contiguous ranges,
 * detecting odd/even week patterns for WakeUp's type field.
 *
 * WakeUp type: 0 = every week, 1 = odd weeks only, 2 = even weeks only
 */
interface WeekRange {
    startWeek: number;
    endWeek: number;
    type: number; // 0 | 1 | 2
}

function splitWeeksIntoRanges(weeks: number[]): WeekRange[] {
    if (weeks.length === 0) return [];
    if (weeks.length === 1) {
        return [{ startWeek: weeks[0], endWeek: weeks[0], type: 0 }];
    }

    const sorted = [...weeks].sort((a, b) => a - b);

    // Try to detect if the entire array is an odd-week or even-week pattern
    const allOdd = sorted.every((w) => w % 2 === 1);
    const allEven = sorted.every((w) => w % 2 === 0);

    if (allOdd && isContiguousStep2(sorted)) {
        return [{ startWeek: sorted[0], endWeek: sorted[sorted.length - 1], type: 1 }];
    }
    if (allEven && isContiguousStep2(sorted)) {
        return [{ startWeek: sorted[0], endWeek: sorted[sorted.length - 1], type: 2 }];
    }

    // Otherwise split into contiguous (step=1) sub-ranges
    const ranges: WeekRange[] = [];
    let start = sorted[0];
    let end = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === end + 1) {
            end = sorted[i];
        } else {
            ranges.push({ startWeek: start, endWeek: end, type: 0 });
            start = sorted[i];
            end = sorted[i];
        }
    }
    ranges.push({ startWeek: start, endWeek: end, type: 0 });

    return ranges;
}

/** Check if sorted array forms a contiguous sequence with step=2 (e.g. 1,3,5,7) */
function isContiguousStep2(sorted: number[]): boolean {
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] - sorted[i - 1] !== 2) return false;
    }
    return true;
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
    // Split non-contiguous weeks into multiple entries to avoid phantom conflicts
    const timeSlots = aggregatedCourses.flatMap((c) => {
        const ranges = splitWeeksIntoRanges(c.weeks);
        return ranges.map((range) => ({
            day: c.xq,
            endTime: "",
            endWeek: range.endWeek,
            startWeek: range.startWeek,
            id: c.id,
            level: 0,
            ownTime: false,
            room: c.jxcdmc,
            startNode: c.ps,
            startTime: "",
            step: c.pe - c.ps + 1,
            tableId: 1,
            teacher: c.teaxms,
            type: range.type,  // 0=every week, 1=odd weeks, 2=even weeks
        }));
    });
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
