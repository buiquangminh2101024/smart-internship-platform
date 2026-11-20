// Chạy: node --import tsx --test tests/unit/job-quality-service.test.ts (từ apps/server)
// Chấm và lưu điểm chất lượng tin (AD-29, docs/06-backend/job-quality-moderation/PLAN.md bước 4):
// cột ghi lúc gửi duyệt, "gửi lại không sửa", chấm lỗi không chặn gửi duyệt, chấm lại không ghi
// `submittedContentHash`, API chấm lại, mapper DTO. Loader và Prisma là bản giả trong bộ nhớ.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ModerationActionType } from "@prisma/client";
import { contentHash, type JobQualityInput } from "../../src/modules/job-posts/job-quality";
import type { LoadedJobQualityInput } from "../../src/modules/job-posts/job-quality-input.loader";
import { toJobQualityDto } from "../../src/modules/job-posts/job-quality.mapper";
import { JobQualityService, qualityTurnedBad, type StoredJobQualityBreakdown } from "../../src/modules/job-posts/job-quality.service";
import { JobPostsService } from "../../src/modules/job-posts/job-posts.service";

const NOW = new Date("2026-11-20T03:00:00Z");
const DAY = 86_400_000;

function input(overrides: Partial<JobQualityInput> = {}, signals: Partial<JobQualityInput["signals"]> = {}): JobQualityInput {
  return {
    title: "Thực tập sinh Kinh doanh",
    description:
      "Hỗ trợ đội kinh doanh chăm sóc khách hàng doanh nghiệp, chuẩn bị báo giá, cập nhật dữ liệu khách hàng trên CRM và tham gia các buổi gặp khách cùng trưởng nhóm. Được hướng dẫn quy trình bán hàng B2B từ đầu và giao mục tiêu theo tuần.",
    requirements: "Sinh viên năm 3, năm 4 khối kinh tế; giao tiếp tốt, sử dụng thành thạo Excel và Google Sheets.",
    benefits: "Phụ cấp 4 triệu/tháng, hỗ trợ gửi xe, được xác nhận thực tập và cân nhắc tuyển chính thức.",
    jobType: "INTERNSHIP",
    salaryMin: 4_000_000,
    salaryMax: 5_000_000,
    isNegotiable: false,
    cityId: "city-hn",
    address: "Số 1 Đại Cồ Việt, Hai Bà Trưng",
    industryId: "ind-sales",
    expiresAt: new Date(NOW.getTime() + 30 * DAY),
    submittedAt: null,
    minExperienceYears: null,
    skills: [{ skillId: "s-excel", importance: "REQUIRED", status: "APPROVED" }],
    majors: [{ majorId: "m-biz", relevance: "PRIMARY" }],
    ...overrides,
    signals: {
      resubmittedUnchanged: false,
      rejectionCount: 0,
      companyRetractions: 0,
      companyConfirmedReports: 0,
      companyOpenReports: 0,
      companySubmitCount: 3,
      companyRejectCount: 0,
      companyApprovedCount: 3,
      ...signals,
    },
  };
}

function loaded(jobPostId: string, value: JobQualityInput, status = "DRAFT"): LoadedJobQualityInput {
  return { jobPostId, companyId: "co-1", status, input: value };
}

function buildService(
  rows: LoadedJobQualityInput[],
  options: { loadFails?: boolean; failIds?: string[]; missingOnWrite?: string[]; pendingIds?: string[] } = {},
) {
  const writes: Array<{ id: string; data: Record<string, unknown> }> = [];
  const errors: string[] = [];
  const listQueries: unknown[] = [];
  const notifications: Array<{ type: string; userIds: string[]; data: Record<string, unknown> }> = [];
  const prisma = {
    jobPost: {
      // rescorePendingForCompany: danh sách tin PENDING của công ty.
      findMany: async (args: { where: unknown }) => {
        listQueries.push(args.where);
        return (options.pendingIds ?? []).map((id) => ({ id }));
      },
      updateMany: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        if (options.missingOnWrite?.includes(where.id)) return { count: 0 };
        writes.push({ id: where.id, data });
        return { count: 1 };
      },
    },
  };
  const loader = {
    loadMany: async (ids: readonly string[]) => {
      if (options.loadFails || ids.some((id) => options.failIds?.includes(id))) throw new Error("Neon timeout");
      return rows.filter((row) => ids.includes(row.jobPostId));
    },
  };
  const logger = { info: () => {}, warn: () => {}, error: (message: string) => errors.push(message) };
  const service = new JobQualityService({
    prisma,
    jobQualityInputLoader: loader,
    logger,
    userRepository: { findAdminIds: async () => ["admin-1", "admin-2"] },
    notificationsService: {
      notifyMany: async (type: string, userIds: string[], data: Record<string, unknown>) => {
        notifications.push({ type, userIds, data });
      },
    },
  } as unknown as ConstructorParameters<typeof JobQualityService>[0]);
  return { service, writes, errors, listQueries, notifications };
}

const target = (id: string, submittedContentHash: string | null, lastAction?: ModerationActionType) => ({
  id,
  submittedContentHash,
  moderationActions: lastAction ? [{ action: lastAction }] : [],
});

const breakdownOf = (columns: { qualityBreakdown: unknown }) => columns.qualityBreakdown as StoredJobQualityBreakdown;
const issueCodes = (columns: { qualityBreakdown: unknown }) =>
  breakdownOf(columns).criteria.flatMap((c) => c.issues.map((i) => i.code));

// ─── Gửi duyệt ──────────────────────────────────────────────────────────────

test("gửi duyệt lần đầu: ghi submittedAt, điểm, vùng, phiên bản, lý do SUBMITTED và mã băm", async () => {
  const value = input();
  const { service } = buildService([loaded("job-1", value)]);
  const columns = await service.submissionColumns(target("job-1", null), { now: NOW, autoPublished: false });

  assert.equal(columns.submittedAt, NOW);
  assert.equal(columns.qualityScoredAt, NOW);
  assert.equal(columns.qualityVersion, 1);
  assert.equal(columns.qualityBand, "SUGGEST_APPROVE");
  assert.ok(columns.qualityScore !== null && columns.qualityScore >= 80);
  assert.equal(columns.submittedContentHash, contentHash(value));
  const breakdown = breakdownOf(columns);
  assert.equal(breakdown.reason, "SUBMITTED");
  assert.equal(breakdown.resubmittedUnchanged, false);
  assert.equal(breakdown.criteria.length, 6);
  assert.deepEqual(breakdown.flags, []);
});

test("gửi duyệt: hạn nộp tính từ lúc gửi lần này, không phải submittedAt cũ", async () => {
  // Lần gửi cũ cách 60 ngày, hạn nộp còn 3 ngày: tính từ mốc cũ thì không trừ, từ bây giờ thì trừ.
  const value = input({ submittedAt: new Date(NOW.getTime() - 60 * DAY), expiresAt: new Date(NOW.getTime() + 3 * DAY) });
  const { service } = buildService([loaded("job-1", value)]);
  const columns = await service.submissionColumns(target("job-1", null), { now: NOW, autoPublished: false });
  assert.ok(issueCodes(columns).includes("DEADLINE_TOO_SOON"));
});

test("bị từ chối rồi gửi lại y nguyên ⇒ RESUBMITTED_UNCHANGED, cờ lưu trong breakdown", async () => {
  const value = input();
  const { service } = buildService([loaded("job-1", value)]);
  const columns = await service.submissionColumns(target("job-1", contentHash(value), "REJECTED"), { now: NOW, autoPublished: false });
  assert.ok(issueCodes(columns).includes("RESUBMITTED_UNCHANGED"));
  assert.equal(breakdownOf(columns).resubmittedUnchanged, true);
});

test("bị từ chối, sửa một chữ rồi gửi lại ⇒ không trừ", async () => {
  const before = input();
  const after = input({ description: before.description + " Làm việc tại văn phòng." });
  const { service } = buildService([loaded("job-1", after)]);
  const columns = await service.submissionColumns(target("job-1", contentHash(before), "REJECTED"), { now: NOW, autoPublished: false });
  assert.ok(!issueCodes(columns).includes("RESUBMITTED_UNCHANGED"));
});

test("lần trước được duyệt (không phải từ chối) rồi gửi lại cùng nội dung ⇒ không trừ", async () => {
  const value = input();
  const { service } = buildService([loaded("job-1", value)]);
  const columns = await service.submissionColumns(target("job-1", contentHash(value), "APPROVED"), { now: NOW, autoPublished: false });
  assert.ok(!issueCodes(columns).includes("RESUBMITTED_UNCHANGED"));
});

test("tín hiệu tính cả lần gửi này: tự đăng thì công ty mới không bị 'chưa có tin được duyệt'", async () => {
  const fresh = input({}, { companySubmitCount: 0, companyApprovedCount: 0 });
  const { service } = buildService([loaded("job-1", fresh)]);
  const pending = await service.submissionColumns(target("job-1", null), { now: NOW, autoPublished: false });
  const published = await service.submissionColumns(target("job-1", null), { now: NOW, autoPublished: true });
  assert.ok(issueCodes(pending).includes("COMPANY_NO_HISTORY"));
  assert.ok(!issueCodes(published).includes("COMPANY_NO_HISTORY"));
});

test("chấm lỗi lúc gửi duyệt ⇒ không ném, trả cột rỗng (chưa chấm), giữ mã băm cũ, ghi log", async () => {
  const { service, errors } = buildService([], { loadFails: true });
  const columns = await service.submissionColumns(target("job-1", "old-hash", "REJECTED"), { now: NOW, autoPublished: false });
  assert.equal(columns.submittedAt, NOW);
  assert.equal(columns.qualityScore, null);
  assert.equal(columns.qualityBand, null);
  assert.equal(columns.qualityVersion, null);
  assert.equal(columns.qualityScoredAt, null);
  assert.ok(!("submittedContentHash" in columns));
  assert.equal(errors.length, 1);
});

test("submitForApproval ghi cột điểm vào cùng lệnh đổi trạng thái trong transaction (cả khi tự đăng)", async () => {
  const TX = { tx: true };
  for (const requiresApproval of [true, false]) {
    const updates: Array<{ data: Record<string, unknown>; db: unknown }> = [];
    const company = { id: "co-1", name: "Công ty A", isVerified: true, requiresApproval, verifiedAt: new Date() };
    // Đủ trường cho toJobPostDto (cùng dạng job-post-resubmit.test.ts).
    const jobPost = {
      id: "job-1",
      companyId: "co-1",
      company: { ...company, logoUrl: null, website: null, industryId: null, cityId: null, address: null, taxCode: null, description: null },
      title: "Thực tập sinh Kinh doanh",
      description: "Mô tả",
      jobType: "INTERNSHIP",
      status: "DRAFT",
      salaryMin: null,
      salaryMax: null,
      isNegotiable: true,
      requirements: null,
      benefits: null,
      cityId: "city-1",
      city: null,
      address: "1 Lê Lợi",
      industryId: "ind-1",
      industry: null,
      publishedAt: null,
      expiresAt: new Date(Date.now() + 30 * DAY),
      closedAt: null,
      viewCount: 0,
      minExperienceYears: null,
      requirementsExtra: null,
      requirementsConfirmedAt: null,
      submittedContentHash: null,
      moderationActions: [],
      skills: [{ skill: { id: "sk-1", name: "Excel", status: "APPROVED" }, importance: "REQUIRED", minYears: null }],
      majors: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const submission = { submittedAt: NOW, qualityScore: 91, qualityBand: "SUGGEST_APPROVE", submittedContentHash: "h" };
    const seen: unknown[] = [];
    const service = new JobPostsService({
      prisma: { $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(TX) },
      jobPostRepository: {
        findById: async () => jobPost,
        countModerationActions: async () => 0,
        createModerationAction: async () => {},
        update: async (_id: string, data: Record<string, unknown>, db: unknown) => {
          updates.push({ data, db });
          return { ...jobPost, ...data, autoOutreachEnabled: false };
        },
      },
      employerIdentityCache: { require: async () => ({ employerId: "emp-1", userId: "user-1", companyId: "co-1" }) },
      companyRepository: { findById: async () => company },
      subscriptionsService: { getCompanySubscriptionAccess: async () => ({ mode: "SUBSCRIBED" }) },
      notificationsService: { notifyMany: async () => {} },
      userRepository: { findAdminIds: async () => [] },
      auditLogService: { record: async () => {} },
      autoOutreachTrigger: () => {},
      matchScoreTrigger: () => {},
      jobQualityService: {
        submissionColumns: async (job: unknown, options: { autoPublished: boolean }) => {
          seen.push(job, options.autoPublished);
          return submission;
        },
      },
    } as unknown as ConstructorParameters<typeof JobPostsService>[0]);

    await service.submitForApproval("user-1", "job-1");
    assert.deepEqual(seen, [jobPost, !requiresApproval]);
    assert.equal(updates.length, 1);
    const [update] = updates;
    assert.equal(update!.db, TX);
    assert.equal(update!.data.status, requiresApproval ? "PENDING" : "PUBLISHED");
    assert.equal(update!.data.qualityScore, 91);
    assert.equal(update!.data.submittedContentHash, "h");
    assert.equal(update!.data.submittedAt, NOW);
  }
});

// ─── Chấm lại ───────────────────────────────────────────────────────────────

test("chấm lại: ghi điểm với lý do được truyền, KHÔNG ghi submittedContentHash", async () => {
  const { service, writes } = buildService([loaded("job-1", input()), loaded("job-2", input(), "PUBLISHED")]);
  const stored = await service.scoreAndStoreMany(["job-1", "job-2"], { reason: "SCRIPT", now: NOW });
  assert.deepEqual(stored.map((row) => [row.jobPostId, row.status]), [["job-1", "DRAFT"], ["job-2", "PUBLISHED"]]);
  assert.deepEqual(writes.map((w) => w.id), ["job-1", "job-2"]);
  for (const write of writes) {
    assert.ok(!("submittedContentHash" in write.data));
    assert.ok(!("submittedAt" in write.data));
    assert.equal(breakdownOf(write.data as { qualityBreakdown: unknown }).reason, "SCRIPT");
    assert.equal(write.data.qualityScoredAt, NOW);
  }
});

test("bị từ chối, sửa tin nháp rồi bấm chấm lại, sau đó gửi lại ⇒ so với mã băm của lần gửi bị từ chối", async () => {
  const before = input();
  const after = input({ description: before.description + " Làm việc tại văn phòng." });
  for (const [draft, expectPenalty] of [
    [after, false],
    [before, true], // không sửa gì, chỉ bấm chấm lại ⇒ vẫn là gửi lại y nguyên
  ] as const) {
    const { service, writes } = buildService([loaded("job-1", draft)]);
    // Dòng tin trong DB sau lần gửi bị từ chối; lần chấm lại ghi đè các cột nó trả về.
    const row: Record<string, unknown> = { submittedContentHash: contentHash(before) };
    await service.scoreAndStore("job-1", { reason: "MANUAL", now: NOW });
    Object.assign(row, writes[0]!.data);
    assert.equal(row.submittedContentHash, contentHash(before));

    const columns = await service.submissionColumns(target("job-1", row.submittedContentHash as string, "REJECTED"), {
      now: NOW,
      autoPublished: false,
    });
    assert.equal(issueCodes(columns).includes("RESUBMITTED_UNCHANGED"), expectPenalty);
    assert.equal(columns.submittedContentHash, contentHash(draft));
  }
});

test("chấm lại tin PENDING giữ cờ 'gửi lại không sửa' của lần gửi (loader đưa vào signals)", async () => {
  const { service, writes } = buildService([loaded("job-1", input({}, { resubmittedUnchanged: true }), "PENDING")]);
  await service.scoreAndStore("job-1", { reason: "COMPANY_EVENT", now: NOW });
  const data = writes[0]!.data as { qualityBreakdown: unknown };
  assert.equal(breakdownOf(data).resubmittedUnchanged, true);
  assert.ok(issueCodes(data).includes("RESUBMITTED_UNCHANGED"));
});

test("tin bị xoá giữa lúc nạp và lúc ghi ⇒ bỏ qua, chạy tiếp tin sau", async () => {
  const { service } = buildService([loaded("job-1", input()), loaded("job-2", input())], { missingOnWrite: ["job-1"] });
  const stored = await service.scoreAndStoreMany(["job-1", "job-2"], { reason: "SCRIPT", now: NOW });
  assert.deepEqual(stored.map((row) => row.jobPostId), ["job-2"]);
});

test("API chấm lại: tin không tồn tại ⇒ 404; có ⇒ DTO lý do MANUAL, lý do từ chối tự sinh", async () => {
  const bad = input({ benefits: "Ứng viên trúng tuyển đóng phí hồ sơ 200.000đ trước khi nhận việc." });
  const { service } = buildService([loaded("job-1", bad, "PENDING")]);
  await assert.rejects(service.rescore("missing"), (error: { statusCode?: number; status?: number }) => {
    assert.equal(error.statusCode ?? error.status, 404);
    return true;
  });
  const dto = await service.rescore("job-1");
  assert.equal(dto.scoredReason, "MANUAL");
  assert.equal(dto.band, "SUGGEST_REJECT");
  assert.deepEqual(dto.flags, ["ASKS_FOR_MONEY"]);
  assert.equal(dto.outdated, false);
  assert.equal(dto.criteria.length, 6);
  assert.match(dto.suggestedRejectReason ?? "", /^Vi phạm chính sách\./);
  assert.equal(typeof dto.scoredAt, "string");
});

// ─── Mapper ─────────────────────────────────────────────────────────────────

test("mapper: chưa chấm ⇒ null; điểm của phiên bản cũ ⇒ outdated; breakdown hỏng ⇒ không vỡ", () => {
  const unscored = { qualityScore: null, qualityBand: null, qualityBreakdown: null, qualityVersion: null, qualityScoredAt: null };
  assert.equal(toJobQualityDto(unscored), null);

  const old = toJobQualityDto({ qualityScore: 70, qualityBand: "NEEDS_REVIEW", qualityBreakdown: "rác", qualityVersion: 0, qualityScoredAt: NOW });
  assert.ok(old);
  assert.equal(old.outdated, true);
  assert.deepEqual(old.criteria, []);
  assert.deepEqual(old.flags, []);
  assert.equal(old.scoredReason, null);
  assert.equal(old.suggestedRejectReason, null);
});

// ─── Bước 4b — chấm lại theo sự kiện ───────────────────────────────────────

test("qualityTurnedBad: chỉ báo khi chuyển sang xấu, không báo lặp", () => {
  const none: string[] = [];
  assert.equal(qualityTurnedBad({ band: "SUGGEST_APPROVE", flags: none }, { band: "SUGGEST_REJECT", flags: none }), true);
  assert.equal(qualityTurnedBad({ band: "NEEDS_REVIEW", flags: none }, { band: "SUGGEST_REJECT", flags: none }), true);
  // Chưa từng chấm (tin đăng trước khi có tính năng) mà giờ vào vùng từ chối ⇒ báo.
  assert.equal(qualityTurnedBad({ band: null, flags: none }, { band: "SUGGEST_REJECT", flags: none }), true);
  assert.equal(qualityTurnedBad({ band: "SUGGEST_APPROVE", flags: none }, { band: "NEEDS_REVIEW", flags: none }), false);
  // Vẫn xấu như cũ ⇒ không báo nữa.
  assert.equal(qualityTurnedBad({ band: "SUGGEST_REJECT", flags: none }, { band: "SUGGEST_REJECT", flags: none }), false);
  assert.equal(
    qualityTurnedBad({ band: "SUGGEST_REJECT", flags: ["ASKS_FOR_MONEY"] }, { band: "SUGGEST_REJECT", flags: ["ASKS_FOR_MONEY"] }),
    false,
  );
  // Mới dính cờ chặn dù vùng trước đã là từ chối ⇒ báo.
  assert.equal(qualityTurnedBad({ band: "SUGGEST_REJECT", flags: none }, { band: "SUGGEST_REJECT", flags: ["ASKS_FOR_MONEY"] }), true);
});

test("rescorePendingForCompany: chỉ lấy tin PENDING của đúng công ty, lý do COMPANY_EVENT, một tin lỗi không dừng lượt", async () => {
  const rows = [loaded("job-1", input(), "PENDING"), loaded("job-2", input(), "PENDING"), loaded("job-3", input(), "PENDING")];
  const { service, writes, errors, listQueries } = buildService(rows, { pendingIds: ["job-1", "job-2", "job-3"], failIds: ["job-2"] });
  const summary = await service.rescorePendingForCompany("co-1");
  assert.deepEqual(listQueries, [{ companyId: "co-1", status: "PENDING" }]);
  assert.deepEqual(summary, { scored: 2, failed: 1 });
  assert.deepEqual(writes.map((w) => w.id), ["job-1", "job-3"]);
  for (const write of writes) assert.equal(breakdownOf(write.data as { qualityBreakdown: unknown }).reason, "COMPANY_EVENT");
  assert.equal(errors.length, 1);
});

test("triggerCompany: gọi trùng công ty khi đang chấm ⇒ không chạy chồng, chấm thêm đúng một vòng", async () => {
  const { service } = buildService([]);
  const calls: string[] = [];
  let active = 0;
  let maxActive = 0;
  service.rescorePendingForCompany = async (companyId: string) => {
    calls.push(companyId);
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return { scored: 0, failed: 0 };
  };
  const first = service.triggerCompany("co-1");
  void service.triggerCompany("co-1");
  void service.triggerCompany("co-1");
  const other = service.triggerCompany("co-2");
  await Promise.all([first, other]);
  assert.equal(calls.filter((c) => c === "co-1").length, 2);
  assert.equal(calls.filter((c) => c === "co-2").length, 1);
  assert.equal(maxActive, 2, "hai công ty khác nhau chạy song song, cùng công ty thì không");
  // Lượt đã xong ⇒ sự kiện sau chạy lượt mới.
  await service.triggerCompany("co-1");
  assert.equal(calls.filter((c) => c === "co-1").length, 3);
});

test("triggerCompany: lượt lỗi chỉ ghi log, lần gọi sau vẫn chạy", async () => {
  const { service, errors } = buildService([]);
  let calls = 0;
  service.rescorePendingForCompany = async () => {
    calls += 1;
    throw new Error("DB lỗi");
  };
  await service.triggerCompany("co-1");
  await service.triggerCompany("co-1");
  assert.equal(calls, 2);
  assert.equal(errors.length, 2);
});

const EDIT_TARGET = { id: "job-1", title: "Thực tập sinh Kinh doanh", company: { name: "Công ty A" } };
const MONEY = { benefits: "Ứng viên trúng tuyển đóng phí hồ sơ 200.000đ trước khi nhận việc." };

test("sửa tin đang hiển thị: tốt → có cờ chặn ⇒ chấm lại (PUBLISHED_EDIT) và báo mọi Admin một lần", async () => {
  const { service, writes, notifications } = buildService([loaded("job-1", input(MONEY), "PUBLISHED")]);
  await service.rescoreAfterPublishedEdit({ ...EDIT_TARGET, qualityBand: "SUGGEST_APPROVE", qualityBreakdown: { flags: [] } });
  assert.equal(writes.length, 1);
  assert.ok(!("submittedContentHash" in writes[0]!.data));
  assert.equal(breakdownOf(writes[0]!.data as { qualityBreakdown: unknown }).reason, "PUBLISHED_EDIT");
  assert.equal(notifications.length, 1);
  const [notification] = notifications;
  assert.equal(notification!.type, "JOB_POST_QUALITY_DROPPED");
  assert.deepEqual(notification!.userIds, ["admin-1", "admin-2"]);
  assert.equal(notification!.data.jobPostId, "job-1");
  assert.equal(notification!.data.companyName, "Công ty A");
  assert.equal(notification!.data.blocked, true);
  assert.equal(typeof notification!.data.score, "number");
});

test("sửa tiếp mà vẫn xấu như cũ ⇒ chấm lại nhưng không báo nữa; sửa mà vẫn tốt ⇒ không báo", async () => {
  const bad = buildService([loaded("job-1", input(MONEY), "PUBLISHED")]);
  await bad.service.rescoreAfterPublishedEdit({ ...EDIT_TARGET, qualityBand: "SUGGEST_REJECT", qualityBreakdown: { flags: ["ASKS_FOR_MONEY"] } });
  assert.equal(bad.writes.length, 1);
  assert.equal(bad.notifications.length, 0);

  const good = buildService([loaded("job-1", input(), "PUBLISHED")]);
  await good.service.rescoreAfterPublishedEdit({ ...EDIT_TARGET, qualityBand: "SUGGEST_APPROVE", qualityBreakdown: { flags: [] } });
  assert.equal(good.writes.length, 1);
  assert.equal(good.notifications.length, 0);
});

test("sửa tin đang hiển thị: chấm lỗi ⇒ không ném, ghi log, không báo", async () => {
  const { service, errors, notifications } = buildService([], { loadFails: true });
  await service.rescoreAfterPublishedEdit({ ...EDIT_TARGET, qualityBand: null, qualityBreakdown: null });
  assert.equal(errors.length, 1);
  assert.equal(notifications.length, 0);
});

/** Tin đủ trường cho toJobPostDto, cho các test gọi JobPostsService. */
function fullJobPost(status: string, requiresApproval: boolean) {
  const company = { id: "co-1", name: "Công ty A", isVerified: true, requiresApproval, verifiedAt: new Date() };
  return {
    id: "job-1",
    companyId: "co-1",
    company: { ...company, logoUrl: null, website: null, industryId: null, cityId: null, address: null, taxCode: null, description: null },
    title: "Thực tập sinh Kinh doanh",
    description: "Mô tả",
    jobType: "INTERNSHIP",
    status,
    salaryMin: null,
    salaryMax: null,
    isNegotiable: true,
    requirements: null,
    benefits: null,
    cityId: "city-1",
    city: null,
    address: "1 Lê Lợi",
    industryId: "ind-1",
    industry: null,
    publishedAt: null,
    expiresAt: new Date(Date.now() + 30 * DAY),
    closedAt: null,
    viewCount: 0,
    minExperienceYears: null,
    requirementsExtra: null,
    requirementsConfirmedAt: null,
    qualityBand: "SUGGEST_APPROVE",
    qualityBreakdown: { flags: [] },
    submittedContentHash: null,
    moderationActions: [],
    skills: [{ skill: { id: "sk-1", name: "Excel", status: "APPROVED" }, importance: "REQUIRED", minYears: null }],
    majors: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildJobPostsService(jobPost: ReturnType<typeof fullJobPost>) {
  const events: string[] = [];
  const edited: unknown[] = [];
  const triggers: string[] = [];
  const service = new JobPostsService({
    prisma: {
      $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
        const result = await run({});
        events.push("commit");
        return result;
      },
    },
    jobPostRepository: {
      findById: async () => jobPost,
      findExistingSkillIds: async () => new Set(),
      findExistingMajorIds: async () => new Set(),
      createModerationAction: async () => {},
      transitionIfStatus: async () => true,
      findQuality: async () => ({ qualityScore: null, qualityBand: jobPost.qualityBand }),
      update: async (_id: string, data: object) => ({ ...jobPost, ...data }),
    },
    employerRepository: { findManyByCompanyId: async () => [] },
    employerIdentityCache: { require: async () => ({ employerId: "emp-1", userId: "user-1", companyId: "co-1" }) },
    notificationsService: { notifyMany: async () => {} },
    auditLogService: { record: async () => {} },
    matchScoreTrigger: () => {},
    jobQualityService: {
      rescoreAfterPublishedEdit: async (before: unknown) => {
        events.push("rescore");
        edited.push(before);
      },
    },
    jobQualityCompanyTrigger: (companyId: string) => {
      events.push("trigger");
      triggers.push(companyId);
    },
  } as unknown as ConstructorParameters<typeof JobPostsService>[0]);
  return { service, events, edited, triggers };
}

test("updateDraft tin PUBLISHED ⇒ chấm lại SAU commit với bản tin trước khi sửa; tin nháp ⇒ không chấm", async () => {
  const published = fullJobPost("PUBLISHED", false);
  const ctx = buildJobPostsService(published);
  await ctx.service.updateDraft("user-1", "job-1", { benefits: "Ứng viên đóng phí hồ sơ 200.000đ." } as never);
  assert.deepEqual(ctx.events, ["commit", "rescore"]);
  assert.equal(ctx.edited[0], published);

  const draft = buildJobPostsService(fullJobPost("DRAFT", false));
  await draft.service.updateDraft("user-1", "job-1", { benefits: "Phụ cấp 4 triệu" } as never);
  assert.deepEqual(draft.events, ["commit"]);
});

test("retract ⇒ kích hoạt chấm lại tin chờ duyệt của công ty đúng một lần, sau commit", async () => {
  const ctx = buildJobPostsService(fullJobPost("PUBLISHED", true));
  await ctx.service.retract("admin-1", "job-1", "Lừa đảo");
  assert.deepEqual(ctx.events, ["commit", "trigger"]);
  assert.deepEqual(ctx.triggers, ["co-1"]);
});
