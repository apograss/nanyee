/**
 * Campus timetable definitions — TypeScript rewrite of timetable.py
 * Defines the time slots for 本部 (main campus) and 顺德 (Shunde campus)
 */

export interface TimeSlot {
    node: number;
    startTime: string;
    endTime: string;
}

const MAIN_CAMPUS: TimeSlot[] = [
    { node: 1, startTime: "08:00", endTime: "08:40" },
    { node: 2, startTime: "08:45", endTime: "09:25" },
    { node: 3, startTime: "09:50", endTime: "10:30" },
    { node: 4, startTime: "10:35", endTime: "11:15" },
    { node: 5, startTime: "11:20", endTime: "12:00" },
    { node: 6, startTime: "14:30", endTime: "15:10" },
    { node: 7, startTime: "15:15", endTime: "15:55" },
    { node: 8, startTime: "16:15", endTime: "16:55" },
    { node: 9, startTime: "17:00", endTime: "17:40" },
    { node: 10, startTime: "19:30", endTime: "20:10" },
    { node: 11, startTime: "20:30", endTime: "21:10" },
];

const SHUNDE_CAMPUS: TimeSlot[] = [
    { node: 1, startTime: "08:30", endTime: "09:10" },
    { node: 2, startTime: "09:15", endTime: "09:55" },
    { node: 3, startTime: "10:20", endTime: "11:00" },
    { node: 4, startTime: "11:05", endTime: "11:45" },
    { node: 5, startTime: "11:50", endTime: "12:30" },
    { node: 6, startTime: "14:00", endTime: "14:40" },
    { node: 7, startTime: "14:45", endTime: "15:25" },
    { node: 8, startTime: "15:45", endTime: "16:25" },
    { node: 9, startTime: "16:30", endTime: "17:10" },
    { node: 10, startTime: "19:30", endTime: "20:10" },
    { node: 11, startTime: "20:30", endTime: "21:10" },
];

export type CampusType = "main" | "shunde";

export function getTimetable(campus: CampusType): TimeSlot[] {
    return campus === "main" ? MAIN_CAMPUS : SHUNDE_CAMPUS;
}

/** Get WakeUp-format timetable JSON string */
export function getWakeUpTimetableJSON(campus: CampusType): string {
    const slots = getTimetable(campus);
    // WakeUp needs 60 slots total (padded with dummy slots after real ones)
    const wakeupSlots = [];
    for (let i = 0; i < 60; i++) {
        const real = slots[i];
        if (real) {
            wakeupSlots.push({
                endTime: real.endTime,
                node: real.node,
                startTime: real.startTime,
                timeTable: 1,
            });
        } else {
            wakeupSlots.push({
                endTime: "00:40",
                node: i + 1,
                startTime: "00:00",
                timeTable: 1,
            });
        }
    }
    return JSON.stringify(wakeupSlots);
}
