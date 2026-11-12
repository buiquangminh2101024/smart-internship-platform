// Chạy: node --import tsx --test tests/unit/application-automation.test.ts (từ apps/server)
// Tự xử lý hồ sơ (AD-25, docs/06-backend/application-automation/PLAN.md).
// Bước 3: dải điểm theo ngưỡng X / Y. Bước 4: closeDecision (G1–G4), lượt tự chuyển / tự đóng
// với repository và ApplicationsService giả, lời thông báo khi hệ thống đóng hồ sơ.
// SQL chọn hồ sơ được đối chiếu riêng trên DB thật (bước 8).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApplicationStatus } from "@prisma/client";
import {
  closeDecision,
  closeDueAt,
  effectiveRejectThreshold,
  matchBand,
  type CloseDueInput,
} from "../../src/modules/application-automation/application-automation.policy";
import type { CloseCandidateRow } from "../../src/modules/application-automation/application-automation.repository";
import { ApplicationAutomationService } from "../../src/modules/application-automation/application-automation.service";
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
}

function buildAutomation(options: FakeOptions = {}) {
  const calls = {
    reviewScopes: [] as unknown[],
    limits: [] as number[],
    changes: [] as Array<{ id: string; to: string; extra: unknown }>,
    errors: [] as string[],
  };
  const repository = {
    findAutoReviewTargets: async (scope: unknown, limit: number) => {
      calls.reviewScopes.push(scope);
      calls.limits.push(limit);
      await options.holdReview;
      return (options.reviewTargets ?? []).slice(0, limit);
    },
    findCloseTargets: async (_scope: unknown, limit: number) => (options.closeRows ?? []).slice(0, limit),
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
  assert.match(reviewing.body, /từ "Chờ duyệt" sang "Đang xem xét"/);
});
