// Chạy: node --import tsx --test tests/unit/employer-applications-service.test.ts (từ apps/server)
// Trang "Ứng viên" cấp công ty (docs/06-backend/employer-applications/PLAN.md): bộ lọc và
// sort mặc định chuyển đúng xuống repository, tin công ty khác ⇒ 404, `page` vượt cuối ⇒
// trang cuối; đổi trạng thái hàng loạt bỏ qua đúng lý do và chạy đủ chuỗi ghi (H3, H4).
// Repository là bản giả; SQL (skillMatch, thứ tự D10) được đối chiếu riêng trên DB thật.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApplicationStatus } from "@prisma/client";
import {
  bulkUpdateApplicationStatusSchema,
  listCompanyApplicationsQuerySchema,
} from "../../src/modules/applications/applications.dto";
import {
  containsPattern,
  stripVietnameseMarks,
  VIETNAMESE_MARKED,
  VIETNAMESE_UNMARKED,
  type CompanyApplicationRow,
  type StatusChangeTarget,
} from "../../src/modules/applications/applications.repository";
import { ApplicationsService, canTransition, defaultSort } from "../../src/modules/applications/applications.service";

const EMPLOYER = { id: "emp-1", userId: "user-emp-1", companyId: "co-1" };
const TX = { tx: true };

function row(id: string): CompanyApplicationRow {
  return {
    applicationId: id,
    status: "PENDING",
    appliedAt: new Date("2026-10-10T03:00:00Z"),
    candidateId: `cand-${id}`,
    candidateName: `Ứng viên ${id}`,
    candidateAvatarUrl: null,
    universityName: "Đại học Bách khoa",
    jobPostId: "job-1",
    jobPostTitle: "Thực tập sinh Frontend",
    jobPostStatus: "PUBLISHED",
    awaitingSchedule: false,
    nextInterviewAt: null,
    requiredMatched: 3,
    requiredTotal: 4,
    optionalMatched: 1,
    optionalTotal: 2,
  };
}

function target(id: string, status: ApplicationStatus): StatusChangeTarget {
  return { id, status, jobPostId: "job-1", jobPostTitle: "Thực tập sinh Frontend", companyName: "Công ty A", candidateUserId: `user-${id}` };
}

interface Options {
  statusCounts?: Array<{ status: ApplicationStatus; count: number }>;
  targets?: StatusChangeTarget[];
  /** id mà câu UPDATE có điều kiện không đổi được dòng nào (người khác vừa đổi). */
  raced?: string[];
}

function buildService(options: Options = {}) {
  const calls = {
    list: [] as Array<{ filter: unknown; options: { sort: string; offset: number; limit: number } }>,
    updates: [] as Array<{ id: string; from: ApplicationStatus; to: ApplicationStatus; db: unknown }>,
    history: [] as Array<{ applicationId: string; fromStatus: ApplicationStatus | null; toStatus: ApplicationStatus; actorId: string | null }>,
    cancelled: [] as string[],
    notified: [] as Array<{ type: string; userId: string; payload: Record<string, unknown> }>,
    transactionTimeout: undefined as number | undefined,
  };
  const applicationsRepository = {
    jobPostBelongsToCompany: async (jobPostId: string, companyId: string) => jobPostId !== "job-other-co" && companyId === EMPLOYER.companyId,
    countByStatus: async () => options.statusCounts ?? [{ status: "PENDING", count: 45 }, { status: "REJECTED", count: 5 }],
    countByJob: async () => [{ jobPostId: "job-1", title: "Thực tập sinh Frontend", status: "PUBLISHED", count: 50 }],
    listForCompany: async (_companyId: string, filter: unknown, listOptions: { sort: string; offset: number; limit: number }) => {
      calls.list.push({ filter, options: listOptions });
      return [row("a-1"), row("a-2")];
    },
    findManyForStatusChange: async (ids: string[], companyId: string) =>
      companyId === EMPLOYER.companyId ? (options.targets ?? []).filter((item) => ids.includes(item.id)) : [],
    updateStatusIf: async (id: string, from: ApplicationStatus, to: ApplicationStatus, db: unknown) => {
      calls.updates.push({ id, from, to, db });
      return options.raced?.includes(id) ? 0 : 1;
    },
    createStatusHistory: async (data: (typeof calls.history)[number]) => {
      calls.history.push(data);
    },
    findEmployerApplicationById: async (id: string) => {
      const item = (options.targets ?? []).find((candidate) => candidate.id === id);
      return item
        ? {
            id: item.id,
            status: item.status,
            jobPostId: item.jobPostId,
            jobPost: { title: item.jobPostTitle, company: { name: item.companyName } },
            candidate: { userId: item.candidateUserId },
          }
        : null;
    },
  };
  const prisma = {
    employer: { findUnique: async () => EMPLOYER },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>, transactionOptions?: { timeout?: number }) => {
      calls.transactionTimeout = transactionOptions?.timeout;
      return fn(TX);
    },
  };
  const service = new ApplicationsService({
    prisma,
    applicationsRepository,
    employerRepository: {},
    interviewsRepository: {
      cancelUpcomingForApplication: async (applicationId: string) => {
        calls.cancelled.push(applicationId);
        return 1;
      },
    },
    notificationsService: {
      notify: async (type: string, userId: string, payload: Record<string, unknown>) => {
        calls.notified.push({ type, userId, payload });
      },
    },
  } as unknown as ConstructorParameters<typeof ApplicationsService>[0]);
  return { service, calls };
}

const query = (raw: Record<string, string> = {}) => listCompanyApplicationsQuerySchema.parse(raw);
const bulk = (applicationIds: string[], status: "REVIEWING" | "SHORTLISTED" | "REJECTED") =>
  bulkUpdateApplicationStatusSchema.parse({ applicationIds, status });

// ─── Query và body ──────────────────────────────────────────────────────────

test("query: mặc định trang 1, 20 hồ sơ, không sort (service tự chọn)", () => {
  const parsed = query();
  assert.equal(parsed.page, 1);
  assert.equal(parsed.pageSize, 20);
  assert.equal(parsed.sort, undefined);
});

test("query: q được cắt khoảng trắng, q rỗng coi như không tìm, q 1 ký tự hoặc pageSize 51 ⇒ lỗi", () => {
  assert.equal(query({ q: "  minh  " }).q, "minh");
  assert.equal(query({ q: "   " }).q, undefined);
  assert.equal(listCompanyApplicationsQuerySchema.safeParse({ q: "a" }).success, false);
  assert.equal(listCompanyApplicationsQuerySchema.safeParse({ q: "x".repeat(101) }).success, false);
  assert.equal(listCompanyApplicationsQuerySchema.safeParse({ pageSize: "51" }).success, false);
  assert.equal(listCompanyApplicationsQuerySchema.safeParse({ sort: "match" }).success, false);
  assert.equal(listCompanyApplicationsQuerySchema.safeParse({ status: "WAITING" }).success, false);
});

test("body hàng loạt: trùng id, quá 50 hồ sơ, danh sách rỗng, đích ACCEPTED ⇒ lỗi", () => {
  const ids = (count: number) => Array.from({ length: count }, (_, index) => `a-${index}`);
  assert.equal(bulkUpdateApplicationStatusSchema.safeParse({ applicationIds: ["a-1", "a-1"], status: "REVIEWING" }).success, false);
  assert.equal(bulkUpdateApplicationStatusSchema.safeParse({ applicationIds: ids(51), status: "REVIEWING" }).success, false);
  assert.equal(bulkUpdateApplicationStatusSchema.safeParse({ applicationIds: [], status: "REVIEWING" }).success, false);
  assert.equal(bulkUpdateApplicationStatusSchema.safeParse({ applicationIds: ["a-1"], status: "ACCEPTED" }).success, false);
  assert.equal(bulkUpdateApplicationStatusSchema.safeParse({ applicationIds: ids(50), status: "REJECTED" }).success, true);
});

test("state machine: chỉ chuyển tiến một bước hoặc từ chối; trạng thái cuối không đi đâu", () => {
  assert.equal(canTransition("PENDING", "REVIEWING"), true);
  assert.equal(canTransition("PENDING", "SHORTLISTED"), false);
  assert.equal(canTransition("REVIEWING", "REVIEWING"), false);
  assert.equal(canTransition("INTERVIEWING", "REJECTED"), true);
  assert.equal(canTransition("REJECTED", "REVIEWING"), false);
  assert.equal(canTransition("CANCELLED", "REJECTED"), false);
});

// ─── Tìm không dấu ──────────────────────────────────────────────────────────

test("bảng translate: 12 nguyên âm × 6 thanh (trừ thanh ngang) và đ, cả chữ hoa, dài bằng nhau", () => {
  // a ă â e ê i o ô ơ u ư y: mỗi chữ 5 dấu thanh; ă â ê ô ơ ư còn có dạng không thanh.
  assert.equal([...VIETNAMESE_MARKED].length, 134);
  assert.equal([...VIETNAMESE_UNMARKED].length, [...VIETNAMESE_MARKED].length);
  assert.equal(new Set(VIETNAMESE_MARKED).size, 134);
  assert.match(VIETNAMESE_UNMARKED, /^[aeiouydAEIOUYD]+$/);
  assert.equal(VIETNAMESE_MARKED, VIETNAMESE_MARKED.normalize("NFC"));
});

test("bỏ dấu: dạng dựng sẵn và dạng tổ hợp (e + dấu rời) cho cùng kết quả", () => {
  assert.equal(stripVietnameseMarks("Nguyễn Thị Ánh Tuyết"), "Nguyen Thi Anh Tuyet");
  assert.equal(stripVietnameseMarks("ĐẶNG ĐỨC"), "DANG DUC");
  assert.equal(stripVietnameseMarks("Nguyễn".normalize("NFD")), "Nguyen");
  assert.equal(stripVietnameseMarks("Trường Ưng Ỷ"), "Truong Ung Y");
});

test("mẫu tìm: bỏ dấu, chữ thường, thoát ký tự đặc biệt của ILIKE", () => {
  assert.equal(containsPattern("Nguyễn"), "%nguyen%");
  assert.equal(containsPattern("nguyen"), "%nguyen%");
  assert.equal(containsPattern("50%_a\\b"), "%50\\%\\_a\\\\b%");
});

// ─── Danh sách ──────────────────────────────────────────────────────────────

test("sort mặc định: Chờ duyệt ⇒ nộp lâu nhất trước; tab khác hoặc tất cả ⇒ mới nhất trước", () => {
  assert.equal(defaultSort("PENDING"), "oldest");
  assert.equal(defaultSort("REVIEWING"), "newest");
  assert.equal(defaultSort(undefined), "newest");
});

test("bộ lọc và sort chuyển đúng xuống repository; sort=skills giữ nguyên", async () => {
  const { service, calls } = buildService();
  await service.listCompanyApplications(EMPLOYER.userId, query({ status: "PENDING", jobPostId: "job-1", q: "minh" }));
  await service.listCompanyApplications(EMPLOYER.userId, query({ status: "PENDING", sort: "skills" }));
  assert.deepEqual(calls.list[0]!.filter, { jobPostId: "job-1", q: "minh", status: "PENDING" });
  assert.equal(calls.list[0]!.options.sort, "oldest");
  assert.equal(calls.list[1]!.options.sort, "skills");
});

test("statusCounts đủ mọi trạng thái; total theo tab đang chọn hoặc tổng mọi tab", async () => {
  const { service } = buildService();
  const all = await service.listCompanyApplications(EMPLOYER.userId, query());
  assert.equal(all.total, 50);
  assert.equal(all.statusCounts.PENDING, 45);
  assert.equal(all.statusCounts.SHORTLISTED, 0);
  assert.equal(Object.keys(all.statusCounts).length, 7);
  const rejected = await service.listCompanyApplications(EMPLOYER.userId, query({ status: "REJECTED" }));
  assert.equal(rejected.total, 5);
});

test("trang hợp lệ ⇒ lấy trang đúng một lần, cùng lúc với các số đếm", async () => {
  const { service, calls } = buildService();
  const page = await service.listCompanyApplications(EMPLOYER.userId, query({ page: "2", pageSize: "20" }));
  assert.equal(page.page, 2);
  assert.equal(calls.list.length, 1);
  assert.deepEqual(calls.list[0]!.options, { sort: "newest", offset: 20, limit: 20 });
});

test("page vượt trang cuối ⇒ lấy lại trang cuối, offset theo trang thực trả", async () => {
  const { service, calls } = buildService();
  const page = await service.listCompanyApplications(EMPLOYER.userId, query({ page: "9", pageSize: "20" }));
  assert.equal(page.page, 3);
  assert.equal(calls.list.length, 2);
  assert.deepEqual(calls.list[0]!.options, { sort: "newest", offset: 160, limit: 20 });
  assert.deepEqual(calls.list[1]!.options, { sort: "newest", offset: 40, limit: 20 });
});

test("không có hồ sơ nào ⇒ trang 1 rỗng, không lấy lại trang", async () => {
  const { service, calls } = buildService({ statusCounts: [] });
  const page = await service.listCompanyApplications(EMPLOYER.userId, query({ page: "4" }));
  assert.equal(page.page, 1);
  assert.equal(page.total, 0);
  assert.deepEqual(page.items, []);
  assert.equal(calls.list.length, 1);
});

test("tin của công ty khác ⇒ 404", async () => {
  const { service } = buildService();
  await assert.rejects(
    service.listCompanyApplications(EMPLOYER.userId, query({ jobPostId: "job-other-co" })),
    (error: { statusCode?: number }) => error.statusCode === 404,
  );
});

test("hàng trả về đủ trường, ngày dạng ISO, skillMatch giữ nguyên số", async () => {
  const { service } = buildService();
  const page = await service.listCompanyApplications(EMPLOYER.userId, query());
  const first = page.items[0]!;
  assert.equal(first.appliedAt, "2026-10-10T03:00:00.000Z");
  assert.deepEqual(first.candidate, { id: "cand-a-1", fullName: "Ứng viên a-1", avatarUrl: null, universityName: "Đại học Bách khoa" });
  assert.deepEqual(first.skillMatch, { requiredMatched: 3, requiredTotal: 4, optionalMatched: 1, optionalTotal: 2 });
  assert.equal(first.nextInterviewAt, null);
});

// ─── Đổi trạng thái hàng loạt ───────────────────────────────────────────────

test("lô lẫn trạng thái: hồ sơ hợp lệ được đổi, hồ sơ khác bị bỏ qua đúng lý do, giữ thứ tự gửi lên", async () => {
  const { service, calls } = buildService({
    targets: [target("a-3", "PENDING"), target("a-1", "PENDING"), target("a-2", "REVIEWING"), target("a-4", "PENDING")],
    raced: ["a-4"],
  });
  const result = await service.bulkUpdateStatus(EMPLOYER.userId, bulk(["a-3", "a-2", "other-co", "a-1", "a-4"], "REVIEWING"));
  assert.deepEqual(result.updated, ["a-3", "a-1"]);
  assert.deepEqual(result.skipped, [
    { applicationId: "a-2", reason: "INVALID_TRANSITION" },
    { applicationId: "other-co", reason: "NOT_FOUND" },
    { applicationId: "a-4", reason: "STATUS_CHANGED" },
  ]);
  // Ghi theo thứ tự id, cập nhật có điều kiện trên trạng thái đã đọc, trong transaction 30 giây.
  assert.deepEqual(calls.updates.map((update) => update.id), ["a-1", "a-3", "a-4"]);
  assert.ok(calls.updates.every((update) => update.from === "PENDING" && update.to === "REVIEWING" && update.db === TX));
  assert.equal(calls.transactionTimeout, 30_000);
  // Hồ sơ bị bỏ qua không có lịch sử, không có thông báo.
  assert.deepEqual(calls.history.map((entry) => entry.applicationId), ["a-1", "a-3"]);
  assert.deepEqual(calls.history[0], { applicationId: "a-1", fromStatus: "PENDING", toStatus: "REVIEWING", actorId: EMPLOYER.userId });
  assert.deepEqual(calls.notified.map((entry) => entry.userId), ["user-a-1", "user-a-3"]);
  assert.deepEqual(calls.cancelled, []);
});

test("từ chối hàng loạt: mỗi hồ sơ một thông báo, huỷ lịch sắp tới", async () => {
  const { service, calls } = buildService({
    targets: [target("a-1", "PENDING"), target("a-2", "INTERVIEWING"), target("a-3", "REJECTED")],
  });
  const result = await service.bulkUpdateStatus(EMPLOYER.userId, bulk(["a-1", "a-2", "a-3"], "REJECTED"));
  assert.deepEqual(result.updated, ["a-1", "a-2"]);
  assert.deepEqual(result.skipped, [{ applicationId: "a-3", reason: "INVALID_TRANSITION" }]);
  assert.deepEqual(calls.cancelled, ["a-1", "a-2"]);
  assert.equal(calls.notified.length, 2);
  assert.deepEqual(calls.notified[1], {
    type: "APPLICATION_STATUS_CHANGED",
    userId: "user-a-2",
    payload: {
      applicationId: "a-2",
      jobPostId: "job-1",
      jobPostTitle: "Thực tập sinh Frontend",
      companyName: "Công ty A",
      oldStatus: "INTERVIEWING",
      newStatus: "REJECTED",
    },
  });
});

test("không hồ sơ nào đổi được ⇒ vẫn trả kết quả (200), updated rỗng", async () => {
  const { service, calls } = buildService({ targets: [target("a-1", "ACCEPTED")] });
  const result = await service.bulkUpdateStatus(EMPLOYER.userId, bulk(["a-1", "x"], "SHORTLISTED"));
  assert.deepEqual(result.updated, []);
  assert.equal(result.skipped.length, 2);
  assert.equal(calls.updates.length, 0);
});

// ─── Đổi trạng thái từng hồ sơ ──────────────────────────────────────────────

test("từng hồ sơ: chuyển không hợp lệ ⇒ 400; người khác vừa đổi ⇒ 409 và không ghi gì thêm", async () => {
  const invalid = buildService({ targets: [target("a-1", "PENDING")] });
  await assert.rejects(
    invalid.service.updateApplicationStatus(EMPLOYER.userId, "a-1", { status: "ACCEPTED" }),
    (error: { statusCode?: number }) => error.statusCode === 400,
  );

  const raced = buildService({ targets: [target("a-1", "PENDING")], raced: ["a-1"] });
  await assert.rejects(
    raced.service.updateApplicationStatus(EMPLOYER.userId, "a-1", { status: "REVIEWING" }),
    (error: { statusCode?: number }) => error.statusCode === 409,
  );
  assert.equal(raced.calls.history.length, 0);
  assert.equal(raced.calls.notified.length, 0);
});

test("từng hồ sơ: được nhận ⇒ cùng chuỗi ghi như hàng loạt (lịch sử, huỷ lịch, thông báo)", async () => {
  const { service, calls } = buildService({ targets: [target("a-1", "INTERVIEWING")] });
  await service.updateApplicationStatus(EMPLOYER.userId, "a-1", { status: "ACCEPTED" });
  assert.deepEqual(calls.updates.map(({ id, from, to }) => ({ id, from, to })), [{ id: "a-1", from: "INTERVIEWING", to: "ACCEPTED" }]);
  assert.equal(calls.history.length, 1);
  assert.deepEqual(calls.cancelled, ["a-1"]);
  assert.equal(calls.notified[0]!.payload.newStatus, "ACCEPTED");
});
