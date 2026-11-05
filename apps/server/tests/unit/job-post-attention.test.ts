// Chạy: node --import tsx --test tests/unit/job-post-attention.test.ts (từ apps/server)
// "Tin cần chú ý" (docs/05-frontend/phases/employer-dashboard-v2/PLAN.md B1, B2):
// - query `attention=1` không đi cùng `status`;
// - danh sách chỉ ra tin bị từ chối và tin PUBLISHED hết hạn trong 7 ngày;
// - số đếm cho dashboard bằng số dòng của danh sách trên cùng dữ liệu.
// Prisma là bản giả lọc dữ liệu trong bộ nhớ theo đúng các toán tử repository dùng.
// Câu SQL "thao tác kiểm duyệt gần nhất" được giả lập bằng JS, không kiểm ở đây.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { employerJobPostListQuerySchema } from "../../src/modules/job-posts/job-posts.dto";
import { JobPostRepository } from "../../src/modules/job-posts/job-post.repository";
import { JobPostsService } from "../../src/modules/job-posts/job-posts.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY_MS);

interface Row {
  id: string;
  companyId: string;
  status: string;
  title: string;
  expiresAt: Date | null;
  createdAt: Date;
  /** Thao tác kiểm duyệt, cũ trước mới sau. */
  moderation: string[];
}

const ROWS: Row[] = [
  { id: "j1", companyId: "co-1", status: "PUBLISHED", title: "Frontend", expiresAt: inDays(3), createdAt: inDays(-9), moderation: ["SUBMITTED", "APPROVED"] },
  { id: "j2", companyId: "co-1", status: "PUBLISHED", title: "Backend", expiresAt: inDays(10), createdAt: inDays(-8), moderation: [] },
  // Đã quá hạn nhưng job chuyển EXPIRED chưa chạy: không phải "sắp hết hạn".
  { id: "j3", companyId: "co-1", status: "PUBLISHED", title: "QA", expiresAt: inDays(-1), createdAt: inDays(-7), moderation: [] },
  { id: "j4", companyId: "co-1", status: "DRAFT", title: "Data", expiresAt: null, createdAt: inDays(-6), moderation: ["SUBMITTED", "REJECTED"] },
  // Bị từ chối rồi bị thu hồi duyệt: thao tác gần nhất không phải REJECTED.
  { id: "j5", companyId: "co-1", status: "DRAFT", title: "Mobile", expiresAt: null, createdAt: inDays(-5), moderation: ["REJECTED", "SUBMITTED", "RETRACTED"] },
  { id: "j6", companyId: "co-1", status: "DRAFT", title: "DevOps", expiresAt: inDays(2), createdAt: inDays(-4), moderation: [] },
  { id: "j7", companyId: "co-1", status: "PENDING", title: "Design", expiresAt: inDays(2), createdAt: inDays(-3), moderation: ["SUBMITTED"] },
  { id: "j8", companyId: "co-2", status: "PUBLISHED", title: "Khác 1", expiresAt: inDays(2), createdAt: inDays(-2), moderation: [] },
  { id: "j9", companyId: "co-2", status: "DRAFT", title: "Khác 2", expiresAt: null, createdAt: inDays(-1), moderation: ["REJECTED"] },
];

type Condition = Record<string, unknown>;

function matchesField(value: unknown, condition: unknown): boolean {
  if (condition !== null && typeof condition === "object" && !(condition instanceof Date)) {
    const ops = condition as { in?: unknown[]; gt?: Date; lte?: Date; contains?: string };
    if (ops.in && !ops.in.includes(value)) return false;
    if (ops.gt && !(value instanceof Date && value > ops.gt)) return false;
    if (ops.lte && !(value instanceof Date && value <= ops.lte)) return false;
    if (ops.contains && !String(value).toLowerCase().includes(ops.contains.toLowerCase())) return false;
    return true;
  }
  return value === condition;
}

function matches(row: Row, where: Condition): boolean {
  return Object.entries(where).every(([key, condition]) =>
    key === "OR"
      ? (condition as Condition[]).some((branch) => matches(row, branch))
      : matchesField(row[key as keyof Row], condition),
  );
}

function fakePrisma(rows: Row[]) {
  return {
    jobPost: {
      findMany: async ({ where, take }: { where: Condition; take: number }) =>
        rows
          .filter((row) => matches(row, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, take),
      count: async ({ where }: { where: Condition }) => rows.filter((row) => matches(row, where)).length,
    },
    // findRejectedDraftIds: tham số duy nhất của câu SQL là companyId.
    $queryRaw: async (sql: Prisma.Sql) =>
      rows
        .filter((row) => row.companyId === sql.values[0] && row.status === "DRAFT" && row.moderation.at(-1) === "REJECTED")
        .map((row) => ({ id: row.id })),
  };
}

function buildRepository(rows: Row[] = ROWS) {
  return new JobPostRepository({ prisma: fakePrisma(rows) as unknown as ConstructorParameters<typeof JobPostRepository>[0]["prisma"] });
}

test("dto: attention=1 hợp lệ; đi cùng status hoặc giá trị khác '1' thì lỗi", () => {
  assert.equal(employerJobPostListQuerySchema.safeParse({ attention: "1" }).success, true);
  assert.equal(employerJobPostListQuerySchema.safeParse({ attention: "1", q: "Data" }).success, true);
  assert.equal(employerJobPostListQuerySchema.safeParse({ attention: "1", status: "DRAFT" }).success, false);
  assert.equal(employerJobPostListQuerySchema.safeParse({ attention: "true" }).success, false);
  assert.equal(employerJobPostListQuerySchema.safeParse({ status: "DRAFT" }).success, true);
});

test("repository: attention chỉ ra tin bị từ chối và tin PUBLISHED hết hạn trong 7 ngày của chính công ty", async () => {
  const page = await buildRepository().findOwnedByCompany("co-1", { attention: true }, undefined);
  assert.deepEqual(
    page.items.map((row) => row.id),
    ["j4", "j1"],
  );
});

test("repository: không có attention thì giữ nguyên danh sách cũ", async () => {
  const page = await buildRepository().findOwnedByCompany("co-1", {}, undefined);
  assert.equal(page.items.length, 7);
});

test("repository: attention đi cùng tìm kiếm theo tiêu đề", async () => {
  const page = await buildRepository().findOwnedByCompany("co-1", { attention: true, q: "front" }, undefined);
  assert.deepEqual(
    page.items.map((row) => row.id),
    ["j1"],
  );
});

test("repository: số đếm bằng số dòng của danh sách attention", async () => {
  const repository = buildRepository();
  const [counts, page] = await Promise.all([
    repository.countAttention("co-1"),
    repository.findOwnedByCompany("co-1", { attention: true }, undefined),
  ]);
  assert.deepEqual(counts, { rejected: 1, expiringIn7Days: 1 });
  assert.equal(counts.rejected + counts.expiringIn7Days, page.items.length);
});

test("repository: không có tin bị từ chối thì vẫn lọc đúng (id in [] không khớp gì)", async () => {
  const repository = buildRepository(ROWS.filter((row) => row.id !== "j4"));
  const [counts, page] = await Promise.all([
    repository.countAttention("co-1"),
    repository.findOwnedByCompany("co-1", { attention: true }, undefined),
  ]);
  assert.deepEqual(counts, { rejected: 0, expiringIn7Days: 1 });
  assert.deepEqual(
    page.items.map((row) => row.id),
    ["j1"],
  );
});

function buildService() {
  const calls: unknown[] = [];
  const jobPostRepository = {
    findOwnedByCompany: async (_companyId: string, filter: unknown) => {
      calls.push(filter);
      return { items: [], hasMore: false };
    },
    countAttention: async () => ({ rejected: 2, expiringIn7Days: 3 }),
  };
  const service = new JobPostsService({
    jobPostRepository,
    employerIdentityCache: { require: async () => ({ employerId: "emp-1", userId: "user-1", companyId: "co-1" }) },
  } as unknown as ConstructorParameters<typeof JobPostsService>[0]);
  return { service, calls };
}

test("service: listOwn đổi attention '1' thành true, không có thì false", async () => {
  const { service, calls } = buildService();
  await service.listOwn("user-1", { attention: "1" });
  await service.listOwn("user-1", { status: "DRAFT" });
  assert.deepEqual(calls, [{ attention: true }, { status: "DRAFT", attention: false }]);
});

test("service: attentionSummaryForCompany cộng hai loại", async () => {
  const { service } = buildService();
  assert.deepEqual(await service.attentionSummaryForCompany("co-1"), { total: 5, rejected: 2, expiringIn7Days: 3 });
});
