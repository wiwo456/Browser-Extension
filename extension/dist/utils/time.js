export function startOfTodayIso(now = new Date()) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date.toISOString();
}
export function startOfTodayTimestamp(now = new Date()) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}
export function isSameOrAfterLocalDayStart(isoString, now = new Date()) {
    const timestamp = new Date(isoString).getTime();
    return Number.isFinite(timestamp) && timestamp >= startOfTodayTimestamp(now);
}
export function formatDuration(totalMs) {
    const totalSeconds = Math.floor(totalMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}
