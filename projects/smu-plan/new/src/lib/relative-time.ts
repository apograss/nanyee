const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

const rtf = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });

export function relativeTime(date: string | Date): string {
  const diff = new Date(date).getTime() - Date.now();
  const absDiff = Math.abs(diff);

  for (const [unit, ms] of UNITS) {
    if (absDiff >= ms) {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return "刚刚";
}
