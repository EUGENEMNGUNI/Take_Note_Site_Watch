// Short, human date/time labels used across the dashboards.

const pad = (value: number) => String(value).padStart(2, "0");

const clock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * "09:42 today", "09:42 yesterday", "Monday 09:42" (within the last week) or
 * "03/10 09:42". Times are in the viewer's local time zone, 24-hour clock.
 */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const dayDifference = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );
  if (dayDifference === 0) return `${clock(date)} today`;
  if (dayDifference === 1) return `${clock(date)} yesterday`;
  if (dayDifference > 1 && dayDifference < 7) {
    return `${date.toLocaleDateString([], { weekday: "long" })} ${clock(date)}`;
  }
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${clock(date)}`;
}

/** "INC-014" from the database's sequential reference number. */
export function incidentRef(refNo: number | null | undefined): string {
  return refNo == null ? "INC" : `INC-${String(refNo).padStart(3, "0")}`;
}
