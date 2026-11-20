/**
 * AD-29 bước 5 (điểm 8) — approve / reject / retract đổi trạng thái có điều kiện:
 * hai Admin bấm cùng lúc thì người thua nhận 409 và transaction không ghi gì.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../src/shared/errors/AppError";
import { JobPostsService } from "../../src/modules/job-posts/job-posts.service";

const DAY = 24 * 60 * 60 * 1000;

function jobPost(status: string) {
  return {
    id: "job-1",
    companyId: "co-1",
    company: {
      id: "co-1",
      name: "Công ty A",
      isVerified: true,
      requiresApproval: true,
      verifiedAt: new Date(),
      logoUrl: null,
      website: null,
      industryId: null,
      cityId: null,
      address: null,
      taxCode: null,
      description: null,
    },
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
    autoOutreachEnabled: true,
    qualityScore: 82,
    qualityBand: "SUGGEST_APPROVE",
    qualityBreakdown: { flags: [] },
    submittedContentHash: null,
    moderationActions: [],
    skills: [],
    majors: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * `wins = false` giả lập Admin khác đã chuyển trạng thái giữa lúc đọc và lúc ghi:
 * bản đọc đầu hàm vẫn đúng trạng thái nhưng `updateMany` khớp 0 dòng.
 */
function build(status: string, wins: boolean, options: { rescoredTo?: { qualityScore: number; qualityBand: string } } = {}) {
  const current = jobPost(status);
  // Điểm trong DB lúc ghi action; `rescoredTo` giả lập lối chấm nền đã ghi điểm mới
  // sau khi service đọc tin ở đầu hàm.
  const stored = { qualityScore: current.qualityScore, qualityBand: current.qualityBand, ...options.rescoredTo };
  const writes: string[] = [];
  const transitions: unknown[] = [];
  const actions: Record<string, unknown>[] = [];
  const afterCommit: string[] = [];
  let committed = false;
  const service = new JobPostsService({
    prisma: {
      $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
        const result = await run({});
        committed = true;
        return result;
      },
    },
    jobPostRepository: {
      findById: async () => current,
      transitionIfStatus: async (id: string, from: string, data: Record<string, unknown>) => {
        transitions.push({ id, from, data });
        if (wins) Object.assign(current, data);
        return wins;
      },
      findQuality: async () => {
        writes.push("readQuality");
        return stored;
      },
      createModerationAction: async (data: Record<string, unknown>) => {
        writes.push("action");
        actions.push(data);
      },
      update: async () => {
        throw new Error("approve / reject / retract không được ghi bằng update không điều kiện");
      },
    },
    employerRepository: { findManyByCompanyId: async () => [{ userId: "emp-user-1" }] },
    notificationsService: {
      notifyMany: async () => {
        writes.push("notify");
      },
    },
    auditLogService: {
      record: async () => {
        writes.push("audit");
      },
    },
    autoOutreachTrigger: () => afterCommit.push("outreach"),
    matchScoreTrigger: () => afterCommit.push("match"),
    jobQualityCompanyTrigger: () => afterCommit.push("quality"),
  } as unknown as ConstructorParameters<typeof JobPostsService>[0]);
  return { service, writes, transitions, actions, afterCommit, isCommitted: () => committed };
}

async function assertConflict(promise: Promise<unknown>) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 409);
    assert.equal(error.message, "Tin đã được xử lý bởi người khác");
    return true;
  });
}

test("approve thắng ⇒ đổi PENDING → PUBLISHED có điều kiện, action ghi kèm điểm và vùng", async () => {
  const ctx = build("PENDING", true);
  const dto = await ctx.service.approve("admin-1", "job-1");
  assert.equal(dto.status, "PUBLISHED");
  assert.equal(ctx.transitions.length, 1);
  const transition = ctx.transitions[0] as { id: string; from: string; data: Record<string, unknown> };
  assert.equal(transition.from, "PENDING");
  assert.equal(transition.data.status, "PUBLISHED");
  assert.ok(transition.data.publishedAt instanceof Date);
  assert.deepEqual(ctx.actions, [
    { jobPostId: "job-1", action: "APPROVED", actorId: "admin-1", qualityScore: 82, qualityBand: "SUGGEST_APPROVE" },
  ]);
  assert.deepEqual(ctx.writes, ["readQuality", "action", "notify", "audit"]);
  assert.deepEqual(ctx.afterCommit, ["outreach", "match"]);
});

test("approve thua (Admin khác đã xử lý) ⇒ 409, không action / thông báo / audit / trigger", async () => {
  const ctx = build("PENDING", false);
  await assertConflict(ctx.service.approve("admin-2", "job-1"));
  assert.deepEqual(ctx.writes, []);
  assert.deepEqual(ctx.afterCommit, []);
  assert.equal(ctx.isCommitted(), false);
});

test("chấm nền ghi điểm mới giữa lúc đọc tin và lúc ghi ⇒ action lưu điểm mới (đọc sau khi đổi trạng thái)", async () => {
  const ctx = build("PENDING", true, { rescoredTo: { qualityScore: 60, qualityBand: "NEEDS_REVIEW" } });
  await ctx.service.approve("admin-1", "job-1");
  assert.equal(ctx.actions[0]?.qualityScore, 60);
  assert.equal(ctx.actions[0]?.qualityBand, "NEEDS_REVIEW");
});

test("reject thắng ⇒ PENDING → DRAFT, action ghi lý do + điểm; thua ⇒ 409, không ghi gì", async () => {
  const win = build("PENDING", true);
  const dto = await win.service.reject("admin-1", "job-1", "Thiếu mô tả công việc");
  assert.equal(dto.status, "DRAFT");
  assert.equal((win.transitions[0] as { from: string }).from, "PENDING");
  assert.deepEqual(win.actions, [
    {
      jobPostId: "job-1",
      action: "REJECTED",
      actorId: "admin-1",
      reason: "Thiếu mô tả công việc",
      qualityScore: 82,
      qualityBand: "SUGGEST_APPROVE",
    },
  ]);
  assert.deepEqual(win.writes, ["readQuality", "action", "notify", "audit"]);

  const lose = build("PENDING", false);
  await assertConflict(lose.service.reject("admin-2", "job-1", "Thiếu mô tả công việc"));
  assert.deepEqual(lose.writes, []);
});

test("retract thắng ⇒ PUBLISHED → TAKEN_DOWN rồi chấm lại tin chờ; thua ⇒ 409, không trigger", async () => {
  const win = build("PUBLISHED", true);
  const dto = await win.service.retract("admin-1", "job-1", "Lừa đảo");
  assert.equal(dto.status, "TAKEN_DOWN");
  assert.equal((win.transitions[0] as { from: string }).from, "PUBLISHED");
  assert.equal(win.actions[0]?.action, "RETRACTED");
  assert.equal(win.actions[0]?.qualityScore, 82);
  assert.deepEqual(win.afterCommit, ["quality"]);

  const lose = build("PUBLISHED", false);
  await assertConflict(lose.service.retract("admin-2", "job-1", "Lừa đảo"));
  assert.deepEqual(lose.writes, []);
  assert.deepEqual(lose.afterCommit, []);
});

test("một Admin, tin đã sai trạng thái từ lúc đọc ⇒ vẫn 409 với thông báo cũ, không thử đổi trạng thái", async () => {
  const ctx = build("PUBLISHED", true);
  await assert.rejects(ctx.service.approve("admin-1", "job-1"), /Only a pending job post can be approved/);
  await assert.rejects(ctx.service.reject("admin-1", "job-1", "x"), /Only a pending job post can be rejected/);
  const draft = build("DRAFT", true);
  await assert.rejects(draft.service.retract("admin-1", "job-1", "x"), /Only a published job post can be retracted/);
  assert.equal(ctx.transitions.length + draft.transitions.length, 0);
});
