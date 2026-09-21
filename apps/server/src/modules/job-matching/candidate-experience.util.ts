const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;

export interface WorkPeriod {
  startDate: Date | null;
  endDate: Date | null;
  isCurrent: boolean;
}

/**
 * Tổng thời gian làm việc (năm) = độ dài hợp các khoảng WorkExperience, chồng
 * lấp chỉ tính một lần. Dòng dùng được: có startDate và (endDate hoặc
 * isCurrent), end ≥ start; isCurrent ⇒ end = today. Không dòng nào dùng được ⇒
 * null (không xác định — KHÔNG phải 0). Chưa xét mức liên quan tới tin (D2).
 */
export function computeTotalExperienceYears(rows: WorkPeriod[], today: Date = new Date()): number | null {
  const intervals: [number, number][] = [];
  for (const row of rows) {
    if (!row.startDate) continue;
    const end = row.isCurrent ? today : row.endDate;
    if (!end) continue;
    const startMs = row.startDate.getTime();
    const endMs = end.getTime();
    if (endMs < startMs) continue;
    intervals.push([startMs, endMs]);
  }
  if (intervals.length === 0) return null;

  intervals.sort((left, right) => left[0] - right[0]);
  let totalMs = 0;
  let [currentStart, currentEnd] = intervals[0]!;
  for (const [start, end] of intervals.slice(1)) {
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      totalMs += currentEnd - currentStart;
      [currentStart, currentEnd] = [start, end];
    }
  }
  totalMs += currentEnd - currentStart;

  return totalMs / DAY_MS / DAYS_PER_YEAR;
}
