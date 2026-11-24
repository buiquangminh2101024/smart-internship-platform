/**
 * AD-29 bước 6 — hàng đợi kiểm duyệt: lọc vùng, thứ tự mặc định, phân trang theo khoá
 * với cột cho phép null. Phần phân trang được kiểm bằng cách mô phỏng where / orderBy
 * trên một mảng tin (cùng ngữ nghĩa Postgres: null xếp cuối, hoà thì id tăng dần).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  moderationKeysetWhere,
  moderationOrderBy,
  moderationWhere,
  resolveModerationSort,
  type ModerationQueueSort,
} from "../../../src/modules/job-posts/job-post.repository";
import { moderationIdsQuerySchema, moderationQueueQuerySchema } from "../../../src/modules/job-posts/job-posts.dto";
import { JobPostsService } from "../../../src/modules/job-posts/job-posts.service";

interface Row {
  id: string;
  submittedAt: Date | null;
  qualityScore: number | null;
  createdAt: Date;
}

const day = (n: number) => new Date(Date.UTC(2026, 10, n));

// Có điểm trùng (70), ngày gửi trùng, và null ở cả hai cột.
const ROWS: Row[] = [
  { id: "a", submittedAt: day(3), qualityScore: 70, createdAt: day(1) },
  { id: "b", submittedAt: day(1), qualityScore: 90, createdAt: day(2) },
  { id: "c", submittedAt: null, qualityScore: null, createdAt: day(3) },
  { id: "d", submittedAt: day(3), qualityScore: 70, createdAt: day(3) },
  { id: "e", submittedAt: day(2), qualityScore: null, createdAt: day(5) },
  { id: "f", submittedAt: null, qualityScore: 40, createdAt: day(4) },
  { id: "g", submittedAt: day(1), qualityScore: 70, createdAt: day(5) },
];

type Where = Record<string, unknown>;

function matchField(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null;
  if (cond instanceof Date || typeof cond !== "object") {
    return value instanceof Date && cond instanceof Date ? value.getTime() === cond.getTime() : value === cond;
  }
  if (value === null) return false;
  const ops = cond as { gt?: unknown; lt?: unknown };
  const v = value instanceof Date ? value.getTime() : (value as number | string);
  const norm = (x: unknown) => (x instanceof Date ? x.getTime() : (x as number | string));
  if (ops.gt !== undefined && !(v > norm(ops.gt))) return false;
  if (ops.lt !== undefined && !(v < norm(ops.lt))) return false;
  return true;
}

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Where[]).some((w) => matches(row, w));
    if (key === "AND") return (cond as Where[]).every((w) => matches(row, w));
    return matchField(row[key as keyof Row], cond);
  });
}

function compare(left: Row, right: Row, sort: ModerationQueueSort): number {
  for (const spec of moderationOrderBy(sort)) {
    const [field, raw] = Object.entries(spec)[0]!;
    const dir = typeof raw === "string" ? raw : (raw as { sort: string }).sort;
    const l = left[field as keyof Row];
    const r = right[field as keyof Row];
    if (l === r) continue;
    if (l === null) return 1; // nulls last
    if (r === null) return -1;
    const lv = l instanceof Date ? l.getTime() : l;
    const rv = r instanceof Date ? r.getTime() : r;
    if (lv === rv) continue;
    return (lv < rv ? -1 : 1) * (dir === "desc" ? -1 : 1);
  }
  return 0;
}

const SORTS: ModerationQueueSort[] = ["submitted_asc", "score_desc", "score_asc", "created_desc"];

test("phân trang theo khoá: đi hết từng trang (cỡ 1–3) ra đúng thứ tự đầy đủ, không trùng không sót", () => {
  for (const sort of SORTS) {
    const full = [...ROWS].sort((l, r) => compare(l, r, sort)).map((row) => row.id);
    for (const size of [1, 2, 3]) {
      const seen: string[] = [];
      let anchor: Row | undefined;
      for (;;) {
        const where = anchor ? moderationKeysetWhere(sort, anchor) : {};
        const page = ROWS.filter((row) => matches(row, where as Where))
          .sort((l, r) => compare(l, r, sort))
          .slice(0, size);
        if (page.length === 0) break;
        seen.push(...page.map((row) => row.id));
        anchor = page[page.length - 1];
      }
      assert.deepEqual(seen, full, `${sort}, cỡ trang ${size}`);
    }
  }
});

test("thứ tự: null xếp cuối, hoà thì id tăng dần", () => {
  const order = (sort: ModerationQueueSort) => [...ROWS].sort((l, r) => compare(l, r, sort)).map((row) => row.id);
  assert.deepEqual(order("score_desc"), ["b", "a", "d", "g", "f", "c", "e"]);
  assert.deepEqual(order("score_asc"), ["f", "a", "d", "g", "b", "c", "e"]);
  assert.deepEqual(order("submitted_asc"), ["b", "g", "e", "a", "d", "c", "f"]);
  assert.deepEqual(order("created_desc"), ["e", "g", "f", "c", "d", "b", "a"]);
});

test("tin mốc đã rời bộ lọc (vừa được duyệt) vẫn làm mốc được: trang sau không nhảy", () => {
  const pending = ROWS.filter((row) => row.id !== "a"); // "a" vừa được duyệt, không còn PENDING
  const anchor = ROWS.find((row) => row.id === "a")!;
  const next = pending
    .filter((row) => matches(row, moderationKeysetWhere("score_desc", anchor) as Where))
    .sort((l, r) => compare(l, r, "score_desc"))
    .map((row) => row.id);
  assert.deepEqual(next, ["d", "g", "f", "c", "e"]);
});

test("sort mặc định: PENDING ⇒ submitted_asc; trạng thái khác / không lọc ⇒ created_desc; chọn rõ thì giữ", () => {
  assert.equal(resolveModerationSort({ status: "PENDING" }), "submitted_asc");
  assert.equal(resolveModerationSort({ status: "PUBLISHED" }), "created_desc");
  assert.equal(resolveModerationSort({}), "created_desc");
  assert.equal(resolveModerationSort({ status: "PENDING", sort: "score_desc" }), "score_desc");
});

test("lọc vùng: UNSCORED ⇒ qualityBand null; vùng cụ thể ⇒ đúng vùng; không lọc ⇒ không thêm điều kiện", () => {
  assert.deepEqual(moderationWhere({ status: "PENDING", band: "UNSCORED" }), { status: "PENDING", qualityBand: null });
  assert.deepEqual(moderationWhere({ band: "SUGGEST_REJECT" }), { qualityBand: "SUGGEST_REJECT" });
  assert.deepEqual(moderationWhere({}), {});
});

test("query: nhận band / sort hợp lệ, từ chối giá trị lạ; /ids bỏ cursor", () => {
  assert.equal(moderationQueueQuerySchema.safeParse({ status: "PENDING", band: "UNSCORED", sort: "score_asc" }).success, true);
  assert.equal(moderationQueueQuerySchema.safeParse({ band: "GOOD" }).success, false);
  assert.equal(moderationQueueQuerySchema.safeParse({ sort: "score" }).success, false);
  assert.deepEqual(moderationIdsQuerySchema.parse({ band: "NEEDS_REVIEW", cursor: "x" }), { band: "NEEDS_REVIEW" });
});

function buildService(repo: Record<string, unknown>) {
  return new JobPostsService({ jobPostRepository: repo } as unknown as ConstructorParameters<typeof JobPostsService>[0]);
}

test("service: cursor không trỏ tới tin nào ⇒ 400 INVALID_CURSOR; có trang ⇒ kèm total", async () => {
  const missing = buildService({ findModerationQueue: async () => null });
  await assert.rejects(missing.listForModeration({ status: "PENDING" }, "zzz"), /Invalid cursor/);

  const ok = buildService({ findModerationQueue: async () => ({ items: [], hasMore: false, total: 12 }) });
  const page = await ok.listForModeration({ status: "PENDING" }, undefined);
  assert.equal(page.total, 12);
});

test("service: /ids xin đúng trần 50; stats kèm pendingByBand", async () => {
  let limit = 0;
  const band = { SUGGEST_APPROVE: 3, NEEDS_REVIEW: 2, SUGGEST_REJECT: 1, UNSCORED: 4 };
  const service = buildService({
    findModerationIds: async (_filter: unknown, max: number) => {
      limit = max;
      return { ids: ["a"], total: 80 };
    },
    countByStatus: async () => 0,
    countPendingByBand: async () => band,
  });
  assert.deepEqual(await service.moderationIds({ status: "PENDING", band: "SUGGEST_APPROVE" }), { ids: ["a"], total: 80 });
  assert.equal(limit, 50);
  const stats = await service.moderationStats();
  assert.deepEqual(stats.pendingByBand, band);
});
