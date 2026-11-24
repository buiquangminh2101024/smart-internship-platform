// Chạy: node --import tsx --test tests/unit/outreach/outreach-bulk-invite.test.ts (từ apps/server)
// Bước 3 của tự động mời theo tin (docs/06-backend/auto-outreach/PLAN.md, AD-23 mục 1a):
// "Mời tất cả gợi ý" — kiểm quyền như mời tay, gộp id trùng, mời lần lượt theo thứ tự gửi
// lên, nguồn MANUAL, dừng khi hết hạn mức (người đó và mọi người sau ⇒ QUOTA), chấm điểm
// một lô rồi truyền xuống. createInvitation là bản giả — đã có test riêng
// (outreach-create-invitation.test.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { bulkInviteSchema } from "../../../src/modules/candidate-outreach/candidate-outreach.dto";
import type { OutreachUsage } from "../../../src/modules/candidate-outreach/candidate-outreach-rate-limit.service";
import {
  CandidateOutreachService,
  type CreateInvitationInput,
  type CreateInvitationResult,
  type InvitationSkipReason,
} from "../../../src/modules/candidate-outreach/candidate-outreach.service";
import { AppError } from "../../../src/shared/errors/AppError";

interface Options {
  jobStatus?: string;
  jobOwner?: string;
  usage?: OutreachUsage;
  /** Lý do bỏ qua theo id; id không có ở đây thì tạo được. */
  outcomes?: Record<string, InvitationSkipReason>;
  access?: "SUBSCRIBED" | "TRIAL" | "BLOCKED";
  scoringFails?: boolean;
}

function buildService(options: Options = {}) {
  const calls: CreateInvitationInput[] = [];
  let scoredIds: string[] | null = null;
  const usage = options.usage ?? { total: 0, auto: 0 };
  const service = new CandidateOutreachService({
    employerIdentityCache: { require: async () => ({ employerId: "emp-1", companyId: "co-1" }) },
    candidateOutreachRepository: {
      findOutreachCompany: async () => ({ id: "co-1", name: "Công ty A", verifiedAt: new Date() }),
      findJobPost: async (id: string) => ({
        id,
        title: "Thực tập sinh Backend",
        status: options.jobStatus ?? "PUBLISHED",
        employerId: options.jobOwner ?? "emp-1",
        companyId: "co-1",
      }),
      findAutoSharePercent: async () => 80,
      findSearchCards: async (ids: string[]) =>
        ids.map((id) => ({ candidateId: id, fullName: id, avatarUrl: null, headline: null, cityName: null, education: null })),
    },
    candidateOutreachRateLimitService: { getUsage: async () => usage },
    subscriptionsService: { getCompanySubscriptionAccess: async () => ({ mode: options.access ?? "SUBSCRIBED" }) },
    companySubscriptionRepository: {
      findActiveByCompany: async () => ({ plan: { outreachInvitationDailyQuota: 14, outreachPoolMultiplier: 5 } }),
    },
    jobMatchProfileLoader: {
      load: async () => {
        if (options.scoringFails) throw new Error("loader down");
        return { jobPostId: "job-1", matchText: "" };
      },
    },
    candidateMatchProfileLoader: {
      loadMany: async (ids: string[]) => {
        scoredIds = ids;
        return new Map(ids.map((id) => [id, { candidateId: id, skills: [] }]));
      },
    },
    ruleJobMatcher: { match: ({ candidate }: { candidate: { candidateId: string } }) => ({ score: 75, candidate: candidate.candidateId }) },
    logger: { error: () => undefined },
    config: { JOB_MATCHER_MODE: "rule" },
  } as unknown as ConstructorParameters<typeof CandidateOutreachService>[0]);

  service.createInvitation = async (input: CreateInvitationInput): Promise<CreateInvitationResult> => {
    calls.push(input);
    const reason = options.outcomes?.[input.candidateId];
    if (reason) return { created: false, reason };
    return {
      created: true,
      invitation: {
        id: `inv-${input.candidateId}`,
        candidateId: input.candidateId,
        status: "PENDING",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        respondedAt: null,
        matchScore: input.match?.score ?? null,
        matchWeightsVersion: null,
        candidate: { id: input.candidateId, userId: "u", fullName: input.candidateId },
        jobPost: { id: "job-1", title: "Thực tập sinh Backend", status: "PUBLISHED" },
      } as unknown as Extract<CreateInvitationResult, { created: true }>["invitation"],
    };
  };
  return { service, calls, scored: () => scoredIds };
}

test("schema: 1–10 id", () => {
  assert.equal(bulkInviteSchema.safeParse({ candidateIds: [] }).success, false);
  assert.equal(bulkInviteSchema.safeParse({ candidateIds: Array.from({ length: 11 }, (_, i) => `c${i}`) }).success, false);
  assert.equal(bulkInviteSchema.safeParse({ candidateIds: ["c1", "c2"] }).success, true);
});

test("mời lần lượt theo thứ tự gửi lên, gộp id trùng, nguồn MANUAL, hạn mức theo gói; trả lời mời và người bị bỏ qua", async () => {
  const { service, calls, scored } = buildService({ outcomes: { b: "APPLIED", d: "CANDIDATE_CAP" } });
  const result = await service.bulkInvite("user-emp-1", "job-1", ["a", "b", "a", "c", "d"]);

  assert.deepEqual(calls.map((call) => call.candidateId), ["a", "b", "c", "d"]);
  assert.ok(calls.every((call) => call.source === "MANUAL"));
  assert.deepEqual(calls[0]!.limit, { daily: 14 });
  assert.deepEqual(calls[0]!.sender, { employerId: "emp-1", companyId: "co-1", companyName: "Công ty A" });
  // Chấm một lô rồi truyền điểm xuống — createInvitation không chấm lại.
  assert.deepEqual(scored(), ["a", "b", "c", "d"]);
  assert.equal(calls[0]!.match?.score, 75);

  assert.deepEqual(result.invited.map((dto) => dto.candidateId), ["a", "c"]);
  assert.ok(result.invited.every((dto) => dto.canViewProfile));
  assert.deepEqual(result.skipped, [
    { candidateId: "b", reason: "APPLIED" },
    { candidateId: "d", reason: "CANDIDATE_CAP" },
  ]);
  assert.deepEqual(result.quota, {
    mode: "SUBSCRIBED",
    dailyQuota: 14,
    usedToday: 0,
    remainingToday: 14,
    autoAllowed: true,
    autoLimitToday: 11,
    autoUsedToday: 0,
  });
});

test("hết hạn mức giữa chừng: dừng, người đó và mọi người sau ⇒ QUOTA", async () => {
  const { service, calls } = buildService({ outcomes: { b: "BLOCKED", c: "QUOTA" } });
  const result = await service.bulkInvite("user-emp-1", "job-1", ["a", "b", "c", "d", "e"]);
  assert.deepEqual(calls.map((call) => call.candidateId), ["a", "b", "c"], "không gọi tiếp sau khi hết lượt");
  assert.deepEqual(result.invited.map((dto) => dto.candidateId), ["a"]);
  assert.deepEqual(result.skipped, [
    { candidateId: "b", reason: "BLOCKED" },
    { candidateId: "c", reason: "QUOTA" },
    { candidateId: "d", reason: "QUOTA" },
    { candidateId: "e", reason: "QUOTA" },
  ]);
});

test("hết lượt từ đầu: không chấm điểm, không tạo lời mời, mọi người ⇒ QUOTA", async () => {
  const { service, calls, scored } = buildService({ usage: { total: 14, auto: 9 } });
  const result = await service.bulkInvite("user-emp-1", "job-1", ["a", "b"]);
  assert.equal(calls.length, 0);
  assert.equal(scored(), null);
  assert.deepEqual(result.invited, []);
  assert.deepEqual(result.skipped, [
    { candidateId: "a", reason: "QUOTA" },
    { candidateId: "b", reason: "QUOTA" },
  ]);
  assert.deepEqual(result.quota, {
    mode: "SUBSCRIBED",
    dailyQuota: 14,
    usedToday: 14,
    remainingToday: 0,
    autoAllowed: true,
    autoLimitToday: 11,
    autoUsedToday: 9,
  });
});

test("chấm lô lỗi: vẫn mời, để createInvitation tự chấm từng người (match = undefined)", async () => {
  const { service, calls } = buildService({ scoringFails: true });
  const result = await service.bulkInvite("user-emp-1", "job-1", ["a"]);
  assert.equal(result.invited.length, 1);
  assert.equal("match" in calls[0]! && calls[0]!.match !== undefined, false);
});

test("gói Dùng thử vẫn dùng được, hạn mức 6", async () => {
  const { service, calls } = buildService({ access: "TRIAL" });
  const result = await service.bulkInvite("user-emp-1", "job-1", ["a"]);
  assert.deepEqual(calls[0]!.limit, { daily: 6 });
  assert.deepEqual(result.quota, {
    mode: "TRIAL",
    dailyQuota: 6,
    usedToday: 0,
    remainingToday: 6,
    autoAllowed: false,
    autoLimitToday: 0,
    autoUsedToday: 0,
  });
});

test("quyền như mời tay: tin của người khác ⇒ 404, tin không PUBLISHED ⇒ 409, công ty không còn gói ⇒ 403", async () => {
  const status = async (options: Options) => {
    const { service, calls } = buildService(options);
    try {
      await service.bulkInvite("user-emp-1", "job-1", ["a"]);
      assert.fail("phải lỗi");
    } catch (error) {
      assert.ok(error instanceof AppError);
      assert.equal(calls.length, 0);
      return error.statusCode;
    }
  };
  assert.equal(await status({ jobOwner: "emp-colleague" }), 404);
  assert.equal(await status({ jobStatus: "CLOSED" }), 409);
  assert.equal(await status({ access: "BLOCKED" }), 403);
});
