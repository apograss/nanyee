/**
 * ICS calendar export — TypeScript rewrite of export.py (ICS parts)
 */

import { randomUUID } from "crypto";
import { SingleEvent } from "./schedule";

/**
 * Generate an ICS calendar file from course events
 */
export function generateICS(
    events: SingleEvent[],
    startDate: string, // "YYYY-M-D" — Monday of week 1
): string {
    const [y, m, d] = startDate.split("-").map(Number);
    const semesterStart = new Date(y, m - 1, d); // month is 0-indexed

    const lines: string[] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//nanyee.de//Schedule//CN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:南医课表",
    ];

    for (const event of events) {
        // Calculate actual date: semesterStart + (week-1)*7 + (weekday-1) days
        const daysOffset = (event.zc - 1) * 7 + (event.xq - 1);
        const eventDate = new Date(semesterStart);
        eventDate.setDate(eventDate.getDate() + daysOffset);

        const dateStr = formatDate(eventDate);
        const startTime = event.qssj.replace(":", "") + "00"; // "0800" → "080000"
        const endTime = event.jssj.replace(":", "") + "00";

        const description = [
            `教师: ${event.teaxms}`,
            `场地: ${event.jxcdmc}`,
            `环节: ${event.jxhjmc}`,
            `周次: ${event.zc}`,
            `节次: ${event.ps}-${event.pe}`,
        ].join("\\n");

        lines.push("BEGIN:VEVENT");
        lines.push(`UID:${randomUUID()}@nanyee.de`);
        lines.push(`DTSTAMP:${formatDate(new Date())}T${formatTime(new Date())}`);
        lines.push(`DTSTART:${dateStr}T${startTime}`);
        lines.push(`DTEND:${dateStr}T${endTime}`);
        lines.push(`SUMMARY:${event.kcmc}`);
        lines.push(`LOCATION:${event.jxcdmc}`);
        lines.push(`DESCRIPTION:${description}`);
        lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
}

function formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
}

function formatTime(d: Date): string {
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    return `${h}${m}${s}`;
}
