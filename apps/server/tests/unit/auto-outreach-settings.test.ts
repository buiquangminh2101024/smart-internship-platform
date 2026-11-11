// Chạy: node --import tsx --test tests/unit/auto-outreach-settings.test.ts (từ apps/server)
// Bước 4 của tự động mời theo tin (docs/06-backend/auto-outreach/PLAN.md, AD-23 mục 2, 3, 5):
// quy tắc thuần (phần tự động của hạn mức, lúc kiểm lại tin "hết ứng viên", trạng thái của
// thẻ, khi nào xoá dấu), schema, và AutoOutreachService với repository giả.
import { test } from "node:test";
import assert from "node:assert/strict";
import { autoOutreachRecheckAt, reopensAutoOutreach, resolveAutoOutreachState } from "../../src/modules/candidate-outreach/auto-outreach.policy";
import type { JobAutoOutreachPatch, JobAutoOutreachRow } from "../../src/modules/candidate-outreach/auto-outreach.repository";
import { AutoOutreachService } from "../../src/modules/candidate-outreach/auto-outreach.service";
import { autoDailyLimit } from "../../src/modules/candidate-outreach/candidate-outreach-rate-limit.service";
import {
  updateCompanyOutreachSettingsSchema,
  updateJobAutoOutreachSchema,
} from "../../src/modules/candidate-outreach/candidate-outreach.dto";
import type { OutreachQuotaPolicy } from "../../src/modules/candidate-outreach/candidate-outreach.service";
import type { HiringProgressRow } from "../../src/modules/match-scores/match-score.repository";
import { AppError } from "../../src/shared/errors/AppError";

// ─── Quy tắc thuần ─────────────────────────────────────────────────────────

test("autoDailyLimit: làm tròn xuống theo tỉ lệ", () => {
  assert.equal(autoDailyLimit(14, 80), 11);
  assert.equal(autoDailyLimit(86, 80), 68);
  assert.equal(autoDailyLimit(8, 80), 6);
  assert.equal(autoDailyLimit(14, 0), 0);
  assert.equal(autoDailyLimit(14, 100), 14);
});

test("autoOutreachRecheckAt: NO_MATCH sau 3 giờ, CANDIDATE_CAP ở 0h UTC kế tiếp", () => {
  const at = new Date("2026-11-10T22:30:00.000Z");
  assert.equal(autoOutreachRecheckAt("NO_MATCH", at).toISOString(), "2026-11-11T01:30:00.000Z");
  assert.equal(autoOutreachRecheckAt("CANDIDATE_CAP", at).toISOString(), "2026-11-11T00:00:00.000Z");
  // Đúng 0h UTC vẫn chờ tới 0h hôm sau.
  assert.equal(
    autoOutreachRecheckAt("CANDIDATE_CAP", new Date("2026-11-10T00:00:00.000Z")).toISOString(),
    "2026-11-11T00:00:00.000Z",
  );
});

const RUNNING_INPUT = {
  autoAllowed: true,
  enabled: true,
  jobStatus: "PUBLISHED" as const,
  hiringTarget: 2,
  hiredCount: 0,
  exhaustedAt: null,
  exhaustedReason: null,
};

test("resolveAutoOutreachState: thứ tự PLAN_NOT_ALLOWED → OFF → TARGET_MET → NOT_PUBLISHED → hết ứng viên → RUNNING", () => {
  const state = (patch: Partial<Parameters<typeof resolveAutoOutreachState>[0]>) =>
    resolveAutoOutreachState({ ...RUNNING_INPUT, ...patch }).state;
  assert.equal(state({}), "RUNNING");
  assert.equal(state({ autoAllowed: false, enabled: false }), "PLAN_NOT_ALLOWED");
  assert.equal(state({ enabled: false, jobStatus: "DRAFT" }), "OFF");
  assert.equal(state({ hiredCount: 2, jobStatus: "CLOSED" }), "TARGET_MET");
  assert.equal(state({ jobStatus: "PENDING" }), "NOT_PUBLISHED");
});

test("resolveAutoOutreachState: tạm dừng vì hết ứng viên tới nextCheckAt, quá mốc thì RUNNING", () => {
  const now = new Date("2026-11-10T05:00:00.000Z");
  const noMatch = resolveAutoOutreachState(
    { ...RUNNING_INPUT, exhaustedAt: new Date("2026-11-10T03:00:00.000Z"), exhaustedReason: "NO_MATCH" },
    now,
  );
  assert.equal(noMatch.state, "NO_MATCH");
  assert.equal(noMatch.nextCheckAt?.toISOString(), "2026-11-10T06:00:00.000Z");

  const capped = resolveAutoOutreachState(
    { ...RUNNING_INPUT, exhaustedAt: new Date("2026-11-10T03:00:00.000Z"), exhaustedReason: "CANDIDATE_CAP" },
    now,
  );
  assert.equal(capped.state, "CANDIDATES_CAPPED");
  assert.equal(capped.nextCheckAt?.toISOString(), "2026-11-11T00:00:00.000Z");

  const due = resolveAutoOutreachState(
    { ...RUNNING_INPUT, exhaustedAt: new Date("2026-11-10T01:00:00.000Z"), exhaustedReason: "NO_MATCH" },
    now,
  );
  assert.deepEqual(due, { state: "RUNNING", nextCheckAt: null });
});

test("reopensAutoOutreach: bật lại, hạ ngưỡng, tăng số người cần tuyển", () => {
  const current = { enabled: true, minScore: 80, hiringTarget: 2 };
  assert.equal(reopensAutoOutreach({ ...current, enabled: false }, { enabled: true }), true);
  assert.equal(reopensAutoOutreach(current, { enabled: true }), false, "đang bật, gửi lại enabled: true");
  assert.equal(reopensAutoOutreach(current, { minScore: 70 }), true);
  assert.equal(reopensAutoOutreach(current, { minScore: 90 }), false);
  assert.equal(reopensAutoOutreach(current, { hiringTarget: 3 }), true);
  assert.equal(reopensAutoOutreach(current, { hiringTarget: 1 }), false);
  assert.equal(reopensAutoOutreach(current, { enabled: false }), false);
});

test("schema: cài đặt tin cần ít nhất một trường, đúng khoảng; tỉ lệ công ty 0–100", () => {
  assert.equal(updateJobAutoOutreachSchema.safeParse({}).success, false);
  assert.equal(updateJobAutoOutreachSchema.safeParse({ minScore: 101 }).success, false);
  assert.equal(updateJobAutoOutreachSchema.safeParse({ hiringTarget: 0 }).success, false);
  assert.equal(updateJobAutoOutreachSchema.safeParse({ hiringTarget: 101 }).success, false);
  assert.equal(updateJobAutoOutreachSchema.safeParse({ minScore: 75.5 }).success, false);
  assert.equal(updateJobAutoOutreachSchema.safeParse({ enabled: true, minScore: 0, hiringTarget: 100 }).success, true);
  assert.equal(updateCompanyOutreachSettingsSchema.safeParse({ autoSharePercent: -1 }).success, false);
  assert.equal(updateCompanyOutreachSettingsSchema.safeParse({ autoSharePercent: 100 }).success, true);
});

// ─── AutoOutreachService ───────────────────────────────────────────────────

const SUBSCRIBED: OutreachQuotaPolicy = { mode: "SUBSCRIBED", dailyQuota: 14, autoAllowed: true, poolMultiplier: 5 };
const TRIAL: OutreachQuotaPolicy = { mode: "TRIAL", dailyQuota: 6, autoAllowed: false };

interface Options {
  policy?: OutreachQuotaPolicy | null;
  job?: Partial<JobAutoOutreachRow>;
  isCompanyAdmin?: boolean;
  /** Dòng progressForJob của bảng điểm (0.3); null = tin chưa chấm / không hiển thị. */
  progress?: Partial<HiringProgressRow> | null;
}

const PROGRESS: Partial<HiringProgressRow> = {
  matched: 12,
  matchedApplied: 4,
  interviewing: 2,
  matchScoresAt: new Date("2026-11-11T03:53:00.000Z"),
};

function buildService(options: Options = {}) {
  let job: JobAutoOutreachRow = {
    id: "job-1",
    title: "Thực tập sinh Backend",
    status: "PUBLISHED",
    employerId: "emp-1",
    companyId: "co-1",
    autoOutreachEnabled: false,
    autoOutreachMinScore: 80,
    hiringTarget: 1,
    autoOutreachExhaustedAt: null,
    autoOutreachExhaustedReason: null,
    ...options.job,
  };
  const updates: JobAutoOutreachPatch[] = [];
  // Lượt chạy kích hoạt từ PATCH (bước 5): khoá trả false ⇒ lượt dừng ngay, chỉ ghi công ty.
  const triggered: string[] = [];
  let sharePercent = 80;
  const service = new AutoOutreachService({
    autoOutreachRunStore: {
      tryLock: async (companyId: string) => {
        triggered.push(companyId);
        return false;
      },
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    employerIdentityCache: { require: async () => ({ employerId: "emp-1", companyId: "co-1" }) },
    candidateOutreachRepository: {
      findOutreachCompany: async () => ({ id: "co-1", name: "Công ty A", verifiedAt: new Date() }),
      findAutoSharePercent: async () => sharePercent,
      updateAutoSharePercent: async (_companyId: string, percent: number) => {
        sharePercent = percent;
        return percent;
      },
    },
    candidateOutreachService: { lookupDailyQuota: async () => (options.policy === undefined ? SUBSCRIBED : options.policy) },
    matchScoreRepository: { progressForJob: async () => (options.progress === undefined ? PROGRESS : options.progress) },
    employerRepository: {
      findByUserId: async () => ({ id: "emp-1", companyId: "co-1", isCompanyAdmin: options.isCompanyAdmin ?? true }),
    },
    autoOutreachRepository: {
      findJob: async (id: string) => (id === job.id ? job : null),
      updateJob: async (_id: string, patch: JobAutoOutreachPatch) => {
        updates.push(patch);
        job = {
          ...job,
          ...(patch.enabled !== undefined ? { autoOutreachEnabled: patch.enabled } : {}),
          ...(patch.minScore !== undefined ? { autoOutreachMinScore: patch.minScore } : {}),
          ...(patch.hiringTarget !== undefined ? { hiringTarget: patch.hiringTarget } : {}),
          ...(patch.clearExhausted ? { autoOutreachExhaustedAt: null, autoOutreachExhaustedReason: null } : {}),
        };
        return job;
      },
      countJob: async () => ({ pending: 7, acceptedInvitations: 3, hiredCount: 0, autoSentToday: 4 }),
    },
  } as unknown as ConstructorParameters<typeof AutoOutreachService>[0]);
  return { service, updates, triggered, sharePercent: () => sharePercent };
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    assert.fail("phải lỗi");
  } catch (error) {
    assert.ok(error instanceof AppError);
    return error.statusCode;
  }
}

test("GET cài đặt tin: target = hiringTarget × H, active = pending + đã nhận lời", async () => {
  const { service } = buildService({ job: { autoOutreachEnabled: true, hiringTarget: 2 } });
  const dto = await service.getJobSettings("user-emp-1", "job-1");
  assert.deepEqual(dto, {
    enabled: true,
    minScore: 80,
    hiringTarget: 2,
    state: "RUNNING",
    status: {
      target: 10,
      active: 10,
      pending: 7,
      acceptedInvitations: 3,
      hiredCount: 0,
      autoSentToday: 4,
      nextCheckAt: null,
      matched: 12,
      matchedApplied: 4,
      interviewing: 2,
      matchScoresAt: "2026-11-11T03:53:00.000Z",
    },
  });
});

test("GET cài đặt tin: tin chưa chấm hoặc không hiển thị ⇒ Phù hợp 0, matchScoresAt null", async () => {
  const { service } = buildService({ job: { status: "CLOSED" }, progress: null });
  const { status } = await service.getJobSettings("user-emp-1", "job-1");
  assert.deepEqual(
    { matched: status.matched, matchedApplied: status.matchedApplied, interviewing: status.interviewing, matchScoresAt: status.matchScoresAt },
    { matched: 0, matchedApplied: 0, interviewing: 0, matchScoresAt: null },
  );
});

test("GET cài đặt tin: Dùng thử ⇒ PLAN_NOT_ALLOWED, không có target; không có gói cũng vậy", async () => {
  for (const policy of [TRIAL, null]) {
    const { service } = buildService({ policy });
    const dto = await service.getJobSettings("user-emp-1", "job-1");
    assert.equal(dto.state, "PLAN_NOT_ALLOWED");
    assert.equal(dto.status.target, null);
  }
});

test("chỉ người đăng tin: tin của người khác hoặc không có ⇒ 404 ở cả GET lẫn PATCH", async () => {
  const { service, updates } = buildService({ job: { employerId: "emp-colleague" } });
  assert.equal(await statusOf(service.getJobSettings("user-emp-1", "job-1")), 404);
  assert.equal(await statusOf(service.updateJobSettings("user-emp-1", "job-1", { hiringTarget: 2 })), 404);
  assert.equal(await statusOf(service.getJobSettings("user-emp-1", "job-x")), 404);
  assert.equal(updates.length, 0);
});

test("PATCH: bật khi Dùng thử hoặc không có gói ⇒ 403, không ghi; vẫn sửa được số người cần tuyển", async () => {
  for (const policy of [TRIAL, null]) {
    const { service, updates } = buildService({ policy });
    assert.equal(await statusOf(service.updateJobSettings("user-emp-1", "job-1", { enabled: true, hiringTarget: 3 })), 403);
    assert.equal(updates.length, 0);
    const dto = await service.updateJobSettings("user-emp-1", "job-1", { hiringTarget: 3 });
    assert.equal(dto.hiringTarget, 3);
    assert.equal(dto.enabled, false);
  }
});

test("PATCH: bật lại / hạ ngưỡng / tăng số người cần tuyển ⇒ xoá dấu hết ứng viên; tăng ngưỡng thì giữ", async () => {
  const exhausted = {
    autoOutreachEnabled: true,
    autoOutreachExhaustedAt: new Date(),
    autoOutreachExhaustedReason: "NO_MATCH" as const,
  };

  const raised = buildService({ job: exhausted });
  const kept = await raised.service.updateJobSettings("user-emp-1", "job-1", { minScore: 90 });
  assert.equal(raised.updates[0]!.clearExhausted, false);
  assert.equal(kept.state, "NO_MATCH");
  assert.ok(kept.status.nextCheckAt);
  assert.deepEqual(raised.triggered, [], "tăng ngưỡng ⇒ không chạy lượt mới");

  const lowered = buildService({ job: exhausted });
  const reopened = await lowered.service.updateJobSettings("user-emp-1", "job-1", { minScore: 70 });
  assert.equal(lowered.updates[0]!.clearExhausted, true);
  assert.equal(reopened.state, "RUNNING");
  assert.equal(reopened.minScore, 70);
  assert.deepEqual(lowered.triggered, ["co-1"], "tin PUBLISHED đang bật ⇒ chạy một lượt ngay");

  const enabled = buildService({ job: { ...exhausted, autoOutreachEnabled: false } });
  await enabled.service.updateJobSettings("user-emp-1", "job-1", { enabled: true });
  assert.equal(enabled.updates[0]!.clearExhausted, true);
  assert.deepEqual(enabled.triggered, ["co-1"]);
});

test("PATCH: sửa được khi tin không PUBLISHED; tắt thì state OFF", async () => {
  const { service, triggered } = buildService({ job: { status: "DRAFT", autoOutreachEnabled: true } });
  const dto = await service.updateJobSettings("user-emp-1", "job-1", { enabled: false, hiringTarget: 4 });
  assert.equal(dto.state, "OFF");
  assert.equal(dto.hiringTarget, 4);
  assert.deepEqual(triggered, []);

  const draft = buildService({ job: { status: "DRAFT" } });
  await draft.service.updateJobSettings("user-emp-1", "job-1", { enabled: true });
  assert.deepEqual(draft.triggered, [], "tin chưa hiển thị ⇒ chờ lúc đăng tin mới chạy");
});

test("cài đặt công ty: ai cũng xem được; chỉ quản trị viên được sửa", async () => {
  const member = buildService({ isCompanyAdmin: false });
  assert.deepEqual(await member.service.getCompanySettings("user-emp-1"), { autoSharePercent: 80 });
  assert.equal(await statusOf(member.service.updateCompanySettings("user-emp-1", { autoSharePercent: 50 })), 403);
  assert.equal(member.sharePercent(), 80);

  const admin = buildService({ isCompanyAdmin: true });
  assert.deepEqual(await admin.service.updateCompanySettings("user-emp-1", { autoSharePercent: 0 }), { autoSharePercent: 0 });
  assert.equal(admin.sharePercent(), 0);
});
