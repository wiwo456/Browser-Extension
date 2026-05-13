export function startOfTodayIso(now = new Date()): string {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export function startOfTodayTimestamp(now = new Date()): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function startOfWeekTimestamp(now = new Date()): number {
  const date = new Date(now);
  const day = date.getDay();
  const diff = (day + 6) % 7;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function isSameOrAfterLocalDayStart(isoString: string, now = new Date()): boolean {
  const timestamp = new Date(isoString).getTime();
  return Number.isFinite(timestamp) && timestamp >= startOfTodayTimestamp(now);
}

export function formatDuration(totalMs: number): string {
  const totalSeconds = Math.floor(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}
