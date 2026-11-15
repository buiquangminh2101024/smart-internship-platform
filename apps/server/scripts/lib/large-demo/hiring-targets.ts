// Chỉ tiêu tuyển (`hiringTarget`) cho tin của bộ demo lớn — 0.3 bước 7
// (docs/06-backend/hiring-progress/PLAN.md). Không có chỉ tiêu riêng thì mọi tin là 1 (mặc
// định của cột) và cột "Đã tuyển a/b" của tiến độ tuyển trông giả.
//
// Chỉ tiêu suy từ id tin (băm), không lấy từ bộ số ngẫu nhiên của generate.ts: thêm bước này
// không làm lệch phần còn lại của bộ sinh, và --targets-only gán lại cho tin đang có trên DB
// ra đúng số mà lần seed đầy đủ sẽ sinh, không cần sinh lại cả bộ.
import type { Prisma } from "@prisma/client";

type JobType = Prisma.JobPostCreateManyInput["jobType"] & string;

/**
 * Phân bố chỉ tiêu theo loại tin (trọng số, mỗi loại cộng lại 100): thực tập tuyển theo đợt
 * nên thường 2–4 người, thỉnh thoảng một đợt lớn tới 10; toàn thời gian và hợp đồng tuyển lẻ
 * từng vị trí. Mọi giá trị nằm trong 1–10. Lệch về số nhỏ vì lịch sử demo chỉ có 0–3 đơn
 * ACCEPTED mỗi tin: chỉ tiêu trung bình 6 thì gần như tin nào cũng "0/7", trông giả.
 */
export const HIRING_TARGET_WEIGHTS: Record<JobType, Readonly<Record<number, number>>> = {
  INTERNSHIP: { 1: 10, 2: 25, 3: 25, 4: 15, 5: 10, 6: 6, 8: 5, 10: 4 },
  PART_TIME: { 1: 25, 2: 35, 3: 25, 4: 10, 5: 5 },
  FULL_TIME: { 1: 55, 2: 30, 3: 15 },
  CONTRACT: { 1: 70, 2: 30 },
};

/** FNV-1a 32 bit: cùng id luôn ra cùng số, không phụ thuộc --seed. */
function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Chỉ tiêu gốc của tin, trước khi so với số đã tuyển. */
export function baseHiringTarget(jobId: string, jobType: JobType): number {
  const entries = Object.entries(HIRING_TARGET_WEIGHTS[jobType]).map(([value, weight]) => [Number(value), weight] as const);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = hashId(jobId) % total;
  for (const [value, weight] of entries) {
    if (roll < weight) return value;
    roll -= weight;
  }
  return entries[entries.length - 1]![0];
}

/**
 * Chỉ tiêu cuối: không nhỏ hơn số đơn ACCEPTED, để không có tin "Đã tuyển 3/2". Tin tuyển
 * vừa đủ thì hiện là đã đạt chỉ tiêu, như ngoài thực tế.
 */
export function hiringTargetFor(jobId: string, jobType: JobType, hired: number): number {
  return Math.max(baseHiringTarget(jobId, jobType), hired);
}

/** Nâng chỉ tiêu của tin vừa sinh lên bằng số đơn ACCEPTED trong lịch sử, nếu cần. */
export function raiseTargetsToHired(
  jobPosts: Prisma.JobPostCreateManyInput[],
  applications: readonly Prisma.ApplicationCreateManyInput[],
): void {
  const hired = new Map<string, number>();
  for (const a of applications) if (a.status === "ACCEPTED") hired.set(a.jobPostId, (hired.get(a.jobPostId) ?? 0) + 1);
  for (const job of jobPosts) {
    job.hiringTarget = Math.max(job.hiringTarget ?? 1, hired.get(job.id!) ?? 0);
  }
}
