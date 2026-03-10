export function resolveLatestCheckAt(
  values: Array<string | Date | null | undefined>,
  fallback = new Date()
): string {
  const timestamps = values
    .map((value) => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.getTime();
    })
    .filter((value): value is number => typeof value === "number");

  const latest = timestamps.length ? Math.max(...timestamps) : fallback.getTime();
  return new Date(latest).toISOString();
}
