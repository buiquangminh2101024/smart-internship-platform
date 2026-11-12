// Chạy: node --import tsx --test tests/unit/application-automation.test.ts (từ apps/server)
// Tự xử lý hồ sơ (AD-25, docs/06-backend/application-automation/PLAN.md).
// Bước 3: dải điểm theo ngưỡng X / Y. Bước 4: closeDecision (G1–G4), lượt tự chuyển / tự đóng
// với repository và ApplicationsService giả, lời thông báo khi hệ thống đóng hồ sơ.
// Bước 5: nhắc tuần. Bước 6: cài đặt theo tin (quyền, Y < X, lối quét khi bật lại công tắc).
// SQL chọn hồ sơ được đối chiếu riêng trên DB thật (bước 8).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApplicationStatus } from "@prisma/client";
import {
  closeDecision,
  closeDueAt,
  effectiveRejectThreshold,
  matchBand,
  nextAutoCloseRun,
  vnWeekKey,
  type CloseDueInput,
} from "../../src/modules/application-automation/application-automation.policy";
import type {
  CloseCandidateRow,
  CompanyBacklogRow,
  JobAutomationSettingsPatch,
  JobAutomationSettingsRow,
} from "../../src/modules/application-automation/application-automation.repository";
import { updateJobApplicationAutomationSchema } from "../../src/modules/application-automation/application-automation.dto";
import { ApplicationAutomationService } from "../../src/modules/application-automation/application-automation.service";
import { AppError } from "../../src/shared/errors/AppError";
import type { StatusChangeTarget } from "../../src/modules/applications/applications.repository";
import { renderNotification } from "../../src/modules/notifications/templates/notification-templates";

test("dải điểm: đúng biên X = 80 và Y = 50", () => {
  assert.equal(matchBand(80, 80, 50), "ABOVE");
  assert.equal(matchBand(100, 80, 50), "ABOVE");
  assert.equal(matchBand(79, 80, 50), "MIDDLE");
  assert.equal(matchBand(50, 80, 50), "MIDDLE");
  assert.equal(matchBand(49, 80, 50), "BELOW");
  assert.equal(matchBand(0, 80, 50), "BELOW");
});

test("dải điểm: không có điểm ⇒ null", () => {
  assert.equal(matchBand(null, 80, 50), null);
});

test("Y ≥ X (dữ liệu sửa tay) ⇒ kẹp Y = X − 1, không có điểm nào vừa ABOVE vừa BELOW", () => {
  assert.equal(effectiveRejectThreshold(80, 50), 50);
  assert.equal(effectiveRejectThreshold(60, 60), 59);
  assert.equal(effectiveRejectThreshold(60, 90), 59);
  assert.equal(effectiveRejectThreshold(0, 50), 0);
  assert.equal(matchBand(60, 60, 90), "ABOVE");
  assert.equal(matchBand(59, 60, 90), "MIDDLE");
  assert.equal(matchBand(58, 60, 90), "BELOW");
});

// ─── closeDecision (bước 4c) ────────────────────────────────────────────────

const CLOSED_ON = new Date("2026-11-01T02:00:00Z");
const day = (n: number) => new Date(CLOSED_ON.getTime() + n * 24 * 60 * 60 * 1000);

function input(overrides: Partial<CloseDueInput>): CloseDueInput {
  return {
    status: "REVIEWING",
    jobClosedAt: CLOSED_ON,
    lastInterviewAt: null,
    hasUpcomingInterview: false,
    autoCloseInterviewedEnabled: false,
    ...overrides,
  };
}

test("G1: Chờ duyệt ⇒ tới hạn ngay ngày tin đóng, lời 'ngừng nhận hồ sơ'", () => {
  assert.deepEqual(closeDecision(input({ status: "PENDING" })), { group: "G1", dueAt: CLOSED_ON, reason: "JOB_ENDED" });
});

test("G2: Đang xem xét, Rút gọn / Mời PV chưa phỏng vấn ⇒ ngày tin đóng + 14 ngày", () => {
  for (const status of ["REVIEWING", "SHORTLISTED", "INTERVIEWING"] as const) {
    assert.deepEqual(closeDecision(input({ status })), { group: "G2", dueAt: day(14), reason: "JOB_ENDED" });
  }
});

test("G3: có lịch sắp tới ⇒ không đóng, kể cả đã phỏng vấn và bật công tắc", () => {
  const decision = closeDecision(
    input({ status: "INTERVIEWING", hasUpcomingInterview: true, lastInterviewAt: day(-3), autoCloseInterviewedEnabled: true }),
  );
  assert.equal(decision?.group, "G3");
  assert.equal(decision?.dueAt, null);
});

test("G4: đã phỏng vấn, chưa kết quả ⇒ tắt công tắc thì không đóng; bật thì mốc muộn hơn + 30 ngày", () => {
  const off = closeDecision(input({ status: "INTERVIEWING", lastInterviewAt: day(-5) }));
  assert.deepEqual(off, { group: "G4", dueAt: null, reason: "NO_RESULT" });
  // Buổi phỏng vấn trước ngày tin đóng ⇒ tính từ ngày tin đóng.
  assert.deepEqual(closeDueAt(input({ status: "INTERVIEWING", lastInterviewAt: day(-5), autoCloseInterviewedEnabled: true })), day(30));
  // Buổi phỏng vấn sau ngày tin đóng ⇒ tính từ buổi phỏng vấn.
  assert.deepEqual(closeDueAt(input({ status: "SHORTLISTED", lastInterviewAt: day(4), autoCloseInterviewedEnabled: true })), day(34));
});

test("hồ sơ đã kết thúc ⇒ null", () => {
  for (const status of ["ACCEPTED", "REJECTED", "CANCELLED", "JOB_CLOSED"] as const) {
    assert.equal(closeDecision(input({ status })), null);
  }
});

// ─── ApplicationAutomationService (bước 4b, 4c, 4d) ─────────────────────────

function target(id: string, status: ApplicationStatus): StatusChangeTarget {
  return { id, status, jobPostId: "job-1", jobPostTitle: "Thực tập sinh Backend", companyName: "Công ty A", candidateUserId: `user-${id}` };
}

function closeRow(id: string, overrides: Partial<CloseDueInput>): CloseCandidateRow {
  return { ...target(id, "REVIEWING"), ...input({ jobClosedAt: day(-20), ...overrides }) };
}

interface FakeOptions {
  reviewTargets?: StatusChangeTarget[];
  closeRows?: CloseCandidateRow[];
  raced?: string[];
  failing?: string[];
  /** Chặn câu chọn hồ sơ tự chuyển tới khi gọi `release` (kiểm chạy chồng). */
  holdReview?: Promise<void>;
  backlog?: CompanyBacklogRow[];
  employersByCompany?: Record<string, string[]>;
  /** dedupeKey đã có sẵn (đã nhắc trong tuần). */
  existingKeys?: string[];
  /** userId mà notifyOnce ném lỗi. */
  failingRecipients?: string[];
}

function buildAutomation(options: FakeOptions = {}) {
  const calls = {
    reviewScopes: [] as unknown[],
    limits: [] as number[],
    changes: [] as Array<{ id: string; to: string; extra: unknown }>,
    errors: [] as string[],
    reminders: [] as Array<{ type: string; userId: string; payload: Record<string, unknown>; key: string }>,
  };
  const keys = new Set(options.existingKeys ?? []);
  const repository = {
    findAutoReviewTargets: async (scope: unknown, limit: number) => {
      calls.reviewScopes.push(scope);
      calls.limits.push(limit);
      await options.holdReview;
      return (options.reviewTargets ?? []).slice(0, limit);
    },
    findCloseTargets: async (_scope: unknown, limit: number) => (options.closeRows ?? []).slice(0, limit),
    backlogByCompany: async () => options.backlog ?? [],
  };
  const employerRepository = {
    findManyByCompanyId: async (companyId: string) => (options.employersByCompany?.[companyId] ?? []).map((userId) => ({ userId })),
  };
  const notificationsService = {
    notifyOnce: async (type: string, userId: string, payload: Record<string, unknown>, key: string) => {
      if (options.failingRecipients?.includes(userId)) throw new Error("db down");
      if (keys.has(key)) return false;
      keys.add(key);
      calls.reminders.push({ type, userId, payload, key });
      return true;
    },
  };
  const applicationsService = {
    changeStatusBySystem: async (item: StatusChangeTarget, to: string, extra?: unknown) => {
      if (options.failing?.includes(item.id)) throw new Error("db down");
      calls.changes.push({ id: item.id, to, extra });
      return !options.raced?.includes(item.id);
    },
  };
  const logger = { info: () => {}, warn: () => {}, error: (message: string) => calls.errors.push(message) };
  const service = new ApplicationAutomationService({
    applicationAutomationRepository: repository,
    applicationsService,
    employerRepository,
    notificationsService,
    logger,
  } as unknown as ConstructorParameters<typeof ApplicationAutomationService>[0]);
  return { service, calls };
}

test("autoReview: chuyển từng hồ sơ sang REVIEWING; hồ sơ vừa bị đổi ⇒ raced; lỗi một hồ sơ ⇒ đi tiếp", async () => {
  const { service, calls } = buildAutomation({
    reviewTargets: [target("a-1", "PENDING"), target("a-2", "PENDING"), target("a-3", "PENDING")],
    raced: ["a-2"],
    failing: ["a-1"],
  });
  const result = await service.autoReview({ companyId: "co-1" });
  assert.deepEqual(result, { selected: 3, changed: 1, raced: 1, failed: 1, limited: false });
  assert.deepEqual(calls.changes.map(({ id, to }) => ({ id, to })), [{ id: "a-2", to: "REVIEWING" }, { id: "a-3", to: "REVIEWING" }]);
  assert.deepEqual(calls.reviewScopes, [{ companyId: "co-1" }]);
  assert.equal(calls.limits[0], 500);
  assert.equal(calls.errors.length, 1);
});

test("autoReview: chọn đủ giới hạn ⇒ limited (còn lại để lượt sau)", async () => {
  const { service } = buildAutomation({ reviewTargets: [target("a-1", "PENDING"), target("a-2", "PENDING"), target("a-3", "PENDING")] });
  const result = await service.autoReview({}, 2);
  assert.equal(result.selected, 2);
  assert.equal(result.limited, true);
});

test("autoClose: đóng theo nhóm với đúng closeReason; dòng chưa tới hạn hoặc không đóng ⇒ notDue", async () => {
  const now = new Date();
  const { service, calls } = buildAutomation({
    closeRows: [
      closeRow("g1", { status: "PENDING" }),
      closeRow("g2", { status: "SHORTLISTED" }),
      closeRow("g4", { status: "INTERVIEWING", jobClosedAt: day(-40), lastInterviewAt: day(-45), autoCloseInterviewedEnabled: true }),
      // SQL lệch giờ: chưa tới hạn theo policy.
      closeRow("early", { status: "REVIEWING", jobClosedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) }),
      closeRow("g3", { status: "INTERVIEWING", hasUpcomingInterview: true }),
    ],
  });
  const result = await service.autoClose({}, 500, now);
  assert.equal(result.changed, 3);
  assert.equal(result.notDue, 2);
  assert.deepEqual(result.closedByGroup, { G1: 1, G2: 1, G4: 1 });
  assert.deepEqual(calls.changes, [
    { id: "g1", to: "JOB_CLOSED", extra: { closeReason: "JOB_ENDED" } },
    { id: "g2", to: "JOB_CLOSED", extra: { closeReason: "JOB_ENDED" } },
    { id: "g4", to: "JOB_CLOSED", extra: { closeReason: "NO_RESULT" } },
  ]);
});

test("autoClose: chỉ truyền đúng các trường của StatusChangeTarget xuống lối đổi trạng thái", async () => {
  let received: unknown;
  const { service } = buildAutomation({ closeRows: [closeRow("g1", { status: "PENDING" })] });
  const original = (service as unknown as { applicationsService: { changeStatusBySystem: (t: unknown) => Promise<boolean> } }).applicationsService;
  original.changeStatusBySystem = async (item: unknown) => {
    received = item;
    return true;
  };
  await service.autoClose({});
  assert.deepEqual(received, target("g1", "PENDING"));
});

test("runDaily: chạy tự chuyển rồi tự đóng; lượt thứ hai trong lúc lượt đầu chưa xong ⇒ LOCKED", async () => {
  let release!: () => void;
  const holdReview = new Promise<void>((resolve) => (release = resolve));
  const { service } = buildAutomation({ reviewTargets: [target("a-1", "PENDING")], closeRows: [closeRow("g1", { status: "PENDING" })], holdReview });
  const first = service.runDaily();
  assert.deepEqual(await service.runDaily(), { status: "LOCKED" });
  release();
  const result = await first;
  assert.equal(result.status, "DONE");
  if (result.status === "DONE") {
    assert.equal(result.review.changed, 1);
    assert.equal(result.close.changed, 1);
  }
  // Xong thì chạy lại được.
  assert.equal((await service.runDaily()).status, "DONE");
});

// ─── Lời thông báo khi hệ thống đóng hồ sơ ─────────────────────────────────

const PAYLOAD = {
  applicationId: "a-1",
  jobPostId: "job-1",
  jobPostTitle: "Thực tập sinh Backend",
  companyName: "Công ty A",
  oldStatus: "REVIEWING",
};
const CTX = { webBaseUrl: "http://localhost:3000" };

test("thông báo JOB_CLOSED: lời theo closeReason; trạng thái khác giữ lời cũ", () => {
  const ended = renderNotification("APPLICATION_STATUS_CHANGED", { ...PAYLOAD, newStatus: "JOB_CLOSED", closeReason: "JOB_ENDED" }, CTX);
  assert.equal(ended.title, "Hồ sơ ứng tuyển đã được đóng");
  assert.equal(ended.body, 'Tin "Thực tập sinh Backend" tại Công ty A đã ngừng nhận hồ sơ. Hồ sơ của bạn đã được đóng.');
  assert.equal(ended.email?.subject, "[Công ty A] Thực tập sinh Backend — Tin đã đóng");

  const noResult = renderNotification("APPLICATION_STATUS_CHANGED", { ...PAYLOAD, newStatus: "JOB_CLOSED", closeReason: "NO_RESULT" }, CTX);
  assert.equal(
    noResult.body,
    'Tin "Thực tập sinh Backend" tại Công ty A đã ngừng tuyển và nhà tuyển dụng chưa cập nhật kết quả. Hồ sơ của bạn đã được đóng.',
  );

  const reviewing = renderNotification("APPLICATION_STATUS_CHANGED", { ...PAYLOAD, oldStatus: "PENDING", newStatus: "REVIEWING" }, CTX);
  assert.equal(reviewing.title, "Cập nhật trạng thái hồ sơ ứng tuyển");
  assert.match(reviewing.body ?? "", /từ "Chờ duyệt" sang "Đang xem xét"/);
});

// ─── Nhắc tuần (bước 5) ─────────────────────────────────────────────────────

test("vnWeekKey: thứ Hai của tuần theo giờ Việt Nam (Chủ nhật thuộc tuần trước)", () => {
  // Thứ Hai 16/11/2026 00:30 giờ VN = Chủ nhật 15/11 17:30 UTC.
  assert.equal(vnWeekKey(new Date("2026-11-15T17:30:00Z")), "2026-11-16");
  // Chủ nhật 15/11 23:59 giờ VN = 16:59 UTC ⇒ vẫn tuần bắt đầu 09/11.
  assert.equal(vnWeekKey(new Date("2026-11-15T16:59:00Z")), "2026-11-09");
  // Thứ Hai 8h giờ VN (lúc cron chạy) và thứ Tư cùng tuần ⇒ cùng khoá.
  assert.equal(vnWeekKey(new Date("2026-11-16T01:00:00Z")), "2026-11-16");
  assert.equal(vnWeekKey(new Date("2026-11-18T10:00:00Z")), "2026-11-16");
});

test("nextAutoCloseRun: lượt 8h30 giờ VN đầu tiên không sớm hơn hạn và lúc này", () => {
  const now = new Date("2026-11-16T01:00:00Z"); // thứ Hai 8h00 giờ VN
  // Hạn 18/11 7h giờ VN ⇒ lượt 8h30 cùng ngày.
  assert.deepEqual(nextAutoCloseRun(new Date("2026-11-18T00:00:00Z"), now), new Date("2026-11-18T01:30:00Z"));
  // Hạn 18/11 10h giờ VN ⇒ lượt hôm sau.
  assert.deepEqual(nextAutoCloseRun(new Date("2026-11-18T03:00:00Z"), now), new Date("2026-11-19T01:30:00Z"));
  // Hạn đúng 8h30 ⇒ lượt đó đóng.
  assert.deepEqual(nextAutoCloseRun(new Date("2026-11-18T01:30:00Z"), now), new Date("2026-11-18T01:30:00Z"));
  // Hạn đã qua ⇒ lượt 8h30 sáng nay (nhắc chạy lúc 8h).
  assert.deepEqual(nextAutoCloseRun(new Date("2026-11-10T00:00:00Z"), now), new Date("2026-11-16T01:30:00Z"));
  // Hạn 23h giờ VN (16h UTC) ⇒ 8h30 hôm sau theo giờ VN.
  assert.deepEqual(nextAutoCloseRun(new Date("2026-11-20T16:00:00Z"), now), new Date("2026-11-21T01:30:00Z"));
});

function backlog(companyId: string, overrides: Partial<CompanyBacklogRow> = {}): CompanyBacklogRow {
  return {
    companyId,
    companyName: `Công ty ${companyId}`,
    pendingStale: 12,
    reviewingStale: 0,
    awaitingSchedule: 0,
    needsResult: 3,
    closingSoon: 5,
    closingDueAt: new Date("2026-11-18T03:00:00Z"),
    ...overrides,
  };
}

test("nhắc tuần: mỗi employer một thông báo, khoá theo công ty + người + tuần, closingOn là ngày lượt chạy", async () => {
  const now = new Date("2026-11-16T01:00:00Z");
  const { service, calls } = buildAutomation({
    backlog: [backlog("co-1"), backlog("co-2", { closingSoon: 0, closingDueAt: null })],
    employersByCompany: { "co-1": ["u-1", "u-2"], "co-2": ["u-3"] },
  });
  const result = await service.runWeeklyReminder({}, now);
  assert.equal(result.status, "DONE");
  if (result.status === "DONE") {
    assert.deepEqual({ companies: result.companies, created: result.created, duplicates: result.duplicates, failed: result.failed }, {
      companies: 2,
      created: 3,
      duplicates: 0,
      failed: 0,
    });
  }
  assert.deepEqual(calls.reminders.map((call) => call.key), [
    "APPLICATIONS_NEED_ATTENTION:co-1:u-1:2026-11-16",
    "APPLICATIONS_NEED_ATTENTION:co-1:u-2:2026-11-16",
    "APPLICATIONS_NEED_ATTENTION:co-2:u-3:2026-11-16",
  ]);
  assert.deepEqual(calls.reminders[0]!.payload, {
    companyId: "co-1",
    companyName: "Công ty co-1",
    pendingStale: 12,
    reviewingStale: 0,
    awaitingSchedule: 0,
    needsResult: 3,
    closingSoon: 5,
    closingOn: new Date("2026-11-19T01:30:00Z"),
  });
  assert.equal(calls.reminders[2]!.payload.closingOn, null);
});

test("nhắc tuần: không công ty nào có hồ sơ tồn ⇒ không thông báo", async () => {
  const { service, calls } = buildAutomation({ backlog: [] });
  const result = await service.runWeeklyReminder();
  assert.equal(result.status === "DONE" && result.companies, 0);
  assert.equal(calls.reminders.length, 0);
});

test("nhắc tuần: chạy lại trong tuần ⇒ không tạo trùng; lỗi một người nhận ⇒ đi tiếp", async () => {
  const now = new Date("2026-11-18T10:00:00Z");
  const { service, calls } = buildAutomation({
    backlog: [backlog("co-1")],
    employersByCompany: { "co-1": ["u-1", "u-2", "u-3"] },
    existingKeys: ["APPLICATIONS_NEED_ATTENTION:co-1:u-1:2026-11-16"],
    failingRecipients: ["u-2"],
  });
  const result = await service.runWeeklyReminder({}, now);
  assert.equal(result.status === "DONE" && `${result.created}/${result.duplicates}/${result.failed}`, "1/1/1");
  assert.deepEqual(calls.reminders.map((call) => call.userId), ["u-3"]);
  assert.equal(calls.errors.length, 1);

  // Lượt thứ hai cùng tuần: không thêm gì.
  const again = await service.runWeeklyReminder({}, now);
  assert.equal(again.status === "DONE" && again.created, 0);
});

const NEED_ATTENTION = {
  companyId: "co-1",
  companyName: "Công ty A",
  pendingStale: 12,
  reviewingStale: 0,
  awaitingSchedule: 2,
  needsResult: 3,
  closingSoon: 5,
  closingOn: new Date("2026-11-18T01:30:00Z"),
};

test("lời nhắc tuần: đúng thứ tự, bỏ nhóm bằng 0, có email, link theo ý đầu tiên lọc được", () => {
  const rendered = renderNotification("APPLICATIONS_NEED_ATTENTION", NEED_ATTENTION, CTX);
  assert.equal(rendered.title, "Có hồ sơ ứng viên cần xử lý");
  assert.equal(
    rendered.body,
    "3 ứng viên đã phỏng vấn chưa có kết quả · 5 hồ sơ sẽ tự đóng từ ngày 18/11 · 12 hồ sơ chờ duyệt quá 7 ngày · 2 ứng viên chờ đặt lịch phỏng vấn quá 7 ngày",
  );
  assert.equal(rendered.link, "/employer/applications?focus=result");
  assert.equal(rendered.email?.subject, "[Công ty A] Hồ sơ ứng viên cần xử lý tuần này");
  assert.match(rendered.email?.html ?? "", /Tin đã đóng/);

  const pendingOnly = { ...NEED_ATTENTION, needsResult: 0, closingSoon: 0, closingOn: null, awaitingSchedule: 0 };
  assert.equal(renderNotification("APPLICATIONS_NEED_ATTENTION", pendingOnly, CTX).link, "/employer/applications?status=PENDING");
  const reviewingOnly = { ...pendingOnly, pendingStale: 0, reviewingStale: 4 };
  assert.equal(renderNotification("APPLICATIONS_NEED_ATTENTION", reviewingOnly, CTX).link, "/employer/applications?status=REVIEWING");
  const closingOnly = { ...pendingOnly, pendingStale: 0, closingSoon: 1, closingOn: NEED_ATTENTION.closingOn };
  const closing = renderNotification("APPLICATIONS_NEED_ATTENTION", closingOnly, CTX);
  assert.equal(closing.link, "/employer/applications");
  assert.equal(closing.body, "1 hồ sơ sẽ tự đóng từ ngày 18/11");
});

// ─── Cài đặt theo tin (bước 6) ──────────────────────────────────────────────

const SETTINGS_JOB: JobAutomationSettingsRow = {
  id: "job-1",
  status: "PUBLISHED",
  employerId: "emp-1",
  autoOutreachMinScore: 80,
  autoReviewEnabled: true,
  rejectSuggestBelowScore: 50,
  autoCloseInterviewedEnabled: false,
};

function buildSettings(job: Partial<JobAutomationSettingsRow> = {}, options: { xLoweredTo?: number } = {}) {
  let row: JobAutomationSettingsRow = { ...SETTINGS_JOB, ...job };
  const writes: JobAutomationSettingsPatch[] = [];
  const reviewed: string[] = [];
  const service = new ApplicationAutomationService({
    employerIdentityCache: { require: async () => ({ userId: "user-emp-1", employerId: "emp-1", companyId: "co-1" }) },
    applicationAutomationRepository: {
      findJobSettings: async (id: string) => (id === row.id ? row : null),
      updateJobSettings: async (_id: string, patch: JobAutomationSettingsPatch) => {
        // Giả lập X bị hạ ở cài đặt tự mời ngay trước câu UPDATE có điều kiện Y < X.
        if (options.xLoweredTo !== undefined) row = { ...row, autoOutreachMinScore: options.xLoweredTo };
        if (patch.rejectSuggestBelowScore !== undefined && patch.rejectSuggestBelowScore >= row.autoOutreachMinScore) return false;
        writes.push(patch);
        row = {
          ...row,
          ...(patch.autoReviewEnabled !== undefined ? { autoReviewEnabled: patch.autoReviewEnabled } : {}),
          ...(patch.rejectSuggestBelowScore !== undefined ? { rejectSuggestBelowScore: patch.rejectSuggestBelowScore } : {}),
          ...(patch.autoCloseInterviewedEnabled !== undefined
            ? { autoCloseInterviewedEnabled: patch.autoCloseInterviewedEnabled }
            : {}),
        };
        return true;
      },
      // Lối 3: trigger gọi autoReview theo tin; ghi lại tin được quét.
      findAutoReviewTargets: async (scope: { jobPostId?: string }) => {
        reviewed.push(scope.jobPostId ?? "?");
        return [];
      },
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  } as unknown as ConstructorParameters<typeof ApplicationAutomationService>[0]);
  return { service, writes, reviewed };
}

async function appErrorOf(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof AppError);
    return error;
  }
  return assert.fail("phải lỗi");
}

test("cài đặt tin: GET trả X chỉ đọc và Y thực dùng (kẹp X − 1 khi dữ liệu cũ có Y ≥ X)", async () => {
  assert.deepEqual(await buildSettings().service.getJobSettings("user-emp-1", "job-1"), {
    autoReviewEnabled: true,
    matchThreshold: 80,
    rejectSuggestBelowScore: 50,
    autoCloseInterviewedEnabled: false,
  });
  const legacy = await buildSettings({ autoOutreachMinScore: 40 }).service.getJobSettings("user-emp-1", "job-1");
  assert.equal(legacy.rejectSuggestBelowScore, 39);
});

test("cài đặt tin: chỉ người đăng tin; tin của người khác hoặc không có ⇒ 404, không ghi", async () => {
  const { service, writes } = buildSettings({ employerId: "emp-colleague" });
  assert.equal((await appErrorOf(service.getJobSettings("user-emp-1", "job-1"))).statusCode, 404);
  assert.equal((await appErrorOf(service.updateJobSettings("user-emp-1", "job-1", { autoReviewEnabled: false }))).statusCode, 404);
  assert.equal((await appErrorOf(buildSettings().service.getJobSettings("user-emp-1", "job-x"))).statusCode, 404);
  assert.equal(writes.length, 0);
});

test("cài đặt tin: Y ≥ X ⇒ 400 kèm X, không ghi; Y = X − 1 và Y = 0 thì được", async () => {
  const { service, writes } = buildSettings();
  for (const y of [80, 95]) {
    const error = await appErrorOf(service.updateJobSettings("user-emp-1", "job-1", { rejectSuggestBelowScore: y }));
    assert.equal(error.statusCode, 400);
    assert.match(error.message, /nhỏ hơn ngưỡng phù hợp \(80%\)/);
  }
  assert.equal(writes.length, 0);
  assert.equal((await service.updateJobSettings("user-emp-1", "job-1", { rejectSuggestBelowScore: 79 })).rejectSuggestBelowScore, 79);
  assert.equal((await service.updateJobSettings("user-emp-1", "job-1", { rejectSuggestBelowScore: 0 })).rejectSuggestBelowScore, 0);
});

test("cài đặt tin: X vừa bị hạ giữa lúc đọc và lúc ghi ⇒ 400 theo X mới", async () => {
  const { service, writes } = buildSettings({}, { xLoweredTo: 60 });
  const error = await appErrorOf(service.updateJobSettings("user-emp-1", "job-1", { rejectSuggestBelowScore: 70 }));
  assert.equal(error.statusCode, 400);
  assert.match(error.message, /\(60%\)/);
  assert.equal(writes.length, 0);
});

test("cài đặt tin: sửa được ở tin đã đóng; trả giá trị sau khi ghi", async () => {
  const { service, writes, reviewed } = buildSettings({ status: "CLOSED" });
  const dto = await service.updateJobSettings("user-emp-1", "job-1", { autoCloseInterviewedEnabled: true });
  assert.equal(dto.autoCloseInterviewedEnabled, true);
  assert.deepEqual(writes, [{ autoCloseInterviewedEnabled: true }]);
  assert.deepEqual(reviewed, []);
});

test("cài đặt tin: bật lại tự chuyển ở tin đang đăng ⇒ quét tin đó; đang bật, tắt hoặc tin chưa đăng thì không", async () => {
  const reenabled = buildSettings({ autoReviewEnabled: false });
  await reenabled.service.updateJobSettings("user-emp-1", "job-1", { autoReviewEnabled: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(reenabled.reviewed, ["job-1"]);

  const others = [
    { job: { autoReviewEnabled: true }, patch: { autoReviewEnabled: true } },
    { job: { autoReviewEnabled: true }, patch: { autoReviewEnabled: false } },
    { job: { autoReviewEnabled: false, status: "DRAFT" as const }, patch: { autoReviewEnabled: true } },
    { job: { autoReviewEnabled: false }, patch: { rejectSuggestBelowScore: 40 } },
  ];
  for (const { job, patch } of others) {
    const built = buildSettings(job);
    await built.service.updateJobSettings("user-emp-1", "job-1", patch);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(built.reviewed, [], JSON.stringify({ job, patch }));
  }
});

test("schema PATCH cài đặt tin: cần ít nhất một trường, Y nguyên 0–100", () => {
  assert.equal(updateJobApplicationAutomationSchema.safeParse({}).success, false);
  assert.equal(updateJobApplicationAutomationSchema.safeParse({ rejectSuggestBelowScore: -1 }).success, false);
  assert.equal(updateJobApplicationAutomationSchema.safeParse({ rejectSuggestBelowScore: 101 }).success, false);
  assert.equal(updateJobApplicationAutomationSchema.safeParse({ rejectSuggestBelowScore: 49.5 }).success, false);
  assert.equal(updateJobApplicationAutomationSchema.safeParse({ autoReviewEnabled: "yes" }).success, false);
  assert.equal(
    updateJobApplicationAutomationSchema.safeParse({ autoReviewEnabled: false, rejectSuggestBelowScore: 0, autoCloseInterviewedEnabled: true })
      .success,
    true,
  );
});
