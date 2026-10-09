// Schedule values are wall-clock times in the campaign timezone ("2026-10-10T23:30"), so they are
// displayed as they are, without converting to the browser's timezone.

const wallTimeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  hourCycle: "h23",
  timeZone: "UTC", // the parts are read as-is: UTC here just means "no conversion"
});

/** "2026-10-10T23:30" → "Oct 10, 2026, 23:30" */
export function formatWallTime(value: string): string {
  return wallTimeFormat.format(new Date(`${value}:00Z`));
}
