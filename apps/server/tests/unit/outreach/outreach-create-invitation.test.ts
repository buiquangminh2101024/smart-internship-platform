// Chạy: node --import tsx --test tests/unit/outreach/outreach-create-invitation.test.ts (từ apps/server)
// Bước 2 của tự động mời theo tin (docs/06-backend/auto-outreach/PLAN.md, AD-23):
// createInvitation dùng chung cho mời tay / mời hàng loạt / tự động — thứ tự kiểm, lý do
// bỏ qua, khoá theo ứng viên rồi kiểm lại dưới khoá, ghi nguồn và bộ đếm; trần 10 lời
// mời/ngày của ứng viên; cappedToday trên trang tìm ứng viên; hạn mức chung tay/tự động.
// Repository, Prisma và Redis là bản giả; advisory lock được thử riêng trên DB thật.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { MatchResult } from "@sip/shared-types";
import { CANDIDATE_DAILY_INVITATION_CAP } from "../../../src/modules/candidate-outreach/candidate-outreach.config";
import { hasDailyRoom, type OutreachUsage } from "../../../src/modules/candidate-outreach/candidate-outreach-rate-limit.service";
import { startOfUtcDay } from "../../../src/modules/candidate-outreach/candidate-outreach.repository";
import {
  CandidateOutreachService,
  inviteSkipError,
  type CreateInvitationInput,
  type InvitationSkipReason,
} from "../../../src/modules/candidate-outreach/candidate-outreach.service";
import { AppError } from "../../../src/shared/errors/AppError";

const TX = { tx: true };
const SENDER = { employerId: "emp-1", companyId: "co-1", companyName: "Công ty A" };
const JOB = { id: "job-1", title: "Thực tập sinh Backend" };
const MATCH = { score: 87, weightsVersion: "hybrid-v2" } as MatchResult;

interface State {
  candidate: { id: string; userId: string; isOpenToOutreach: boolean } | null;
  applied: boolean;
  /** Lời mời đang chặn lúc kiểm ngoài transaction / dưới khoá. */
  blocked: { outside: boolean; inside: boolean };
  /** Số lời mời ứng viên đã nhận hôm nay lúc kiểm ngoài transaction / dưới khoá. */
  received: { outside: number; inside: number };
  usage: OutreachUsage;
}

function buildService(overrides: Partial<State> = {}) {
  const state: State = {
    candidate: { id: "cand-1", userId: "user-cand-1", isOpenToOutreach: true },
    applied: false,
    blocked: { outside: false, inside: false },
    received: { outside: 0, inside: 0 },
    usage: { total: 0, auto: 0 },
    ...overrides,
  };
  const log: string[] = [];
  const created: Record<string, unknown>[] = [];
  const recorded: [string, string][] = [];
  const notified: { userId: string; db: unknown }[] = [];
  const inTx = (db: unknown) => db === TX;

  const candidateOutreachRepository = {
    findCandidateForInvite: async () => state.candidate,
    hasApplied: async () => state.applied,
    hasBlockingInvitation: async (_c: string, _j: string, db?: unknown) => {
      log.push(inTx(db) ? "blocked:tx" : "blocked");
      return inTx(db) ? state.blocked.inside : state.blocked.outside;
    },
    countReceivedToday: async (_c: string, db?: unknown) => {
      log.push(inTx(db) ? "received:tx" : "received");
      return inTx(db) ? state.received.inside : state.received.outside;
    },
    lockCandidate: async (candidateId: string, db: unknown) => {
      assert.equal(db, TX, "khoá phải nằm trong transaction");
      log.push(`lock:${candidateId}`);
    },
    create: async (data: Record<string, unknown>, db: unknown) => {
      assert.equal(db, TX);
      log.push("create");
      created.push(data);
      return {
        id: "inv-1",
        status: "PENDING",
        createdAt: new Date(),
        respondedAt: null,
        candidate: { id: data.candidateId, userId: "user-cand-1", fullName: "Ứng viên 1" },
        jobPost: { id: data.jobPostId, title: JOB.title, status: "PUBLISHED" },
        ...data,
      };
    },
  };
  const service = new CandidateOutreachService({
    prisma: {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        log.push("tx");
        return fn(TX);
      },
    },
    candidateOutreachRepository,
    candidateOutreachRateLimitService: {
      getUsage: async () => state.usage,
      recordUsage: async (companyId: string, source: string) => {
        recorded.push([companyId, source]);
      },
    },
    notificationsService: {
      notify: async (_type: string, userId: string, _data: unknown, db: unknown) => {
        notified.push({ userId, db });
      },
    },
    // Không truyền match ⇒ chấm lại; loader trả null ⇒ AppError, scoreForInvitation bắt và trả null.
    jobMatchProfileLoader: {
      load: async () => {
        log.push("score");
        return null;
      },
    },
    logger: { error: () => undefined },
    config: { JOB_MATCHER_MODE: "rule" },
  } as unknown as ConstructorParameters<typeof CandidateOutreachService>[0]);
  return { service, state, log, created, recorded, notified };
}

function input(overrides: Partial<CreateInvitationInput> = {}): CreateInvitationInput {
  return { sender: SENDER, jobPost: JOB, candidateId: "cand-1", source: "AUTO", limit: { daily: 14, auto: 11 }, match: MATCH, ...overrides };
}

// ─── hasDailyRoom ──────────────────────────────────────────────────────────

test("hasDailyRoom: mời tay chỉ xét tổng; tự động phải còn lượt ở cả tổng lẫn phần tự động", () => {
  const limit = { daily: 14, auto: 11 };
  assert.equal(hasDailyRoom({ total: 13, auto: 11 }, limit, "MANUAL"), true, "mời tay dùng được lượt của phần tự động");
  assert.equal(hasDailyRoom({ total: 14, auto: 3 }, limit, "MANUAL"), false);
  assert.equal(hasDailyRoom({ total: 10, auto: 10 }, limit, "AUTO"), true);
  assert.equal(hasDailyRoom({ total: 10, auto: 11 }, limit, "AUTO"), false, "hết phần tự động");
  assert.equal(hasDailyRoom({ total: 14, auto: 2 }, limit, "AUTO"), false, "hết tổng hạn mức (mời tay đã dùng)");
  assert.equal(hasDailyRoom({ total: 0, auto: 0 }, { daily: 14 }, "AUTO"), false, "không truyền phần tự động ⇒ 0");
});

test("startOfUtcDay: mốc đếm trần làm mới lúc 7h sáng giờ Việt Nam", () => {
  assert.equal(startOfUtcDay(new Date("2026-11-10T06:59:59+07:00")).toISOString(), "2026-11-09T00:00:00.000Z");
  assert.equal(startOfUtcDay(new Date("2026-11-10T07:00:00+07:00")).toISOString(), "2026-11-10T00:00:00.000Z");
});

// ─── createInvitation ──────────────────────────────────────────────────────

test("tạo được: khoá ứng viên trước khi kiểm lại và tạo; ghi nguồn, người gửi, điểm có sẵn; tính lượt theo nguồn", async () => {
  const { service, log, created, recorded, notified } = buildService();
  const result = await service.createInvitation(input());
  assert.equal(result.created, true);
  assert.deepEqual(log.filter((step) => step !== "blocked" && step !== "received"), [
    "tx",
    "lock:cand-1",
    "blocked:tx",
    "received:tx",
    "create",
  ]);
  assert.equal(log.includes("score"), false, "đã có điểm thì không chấm lại");
  assert.equal(created[0]!.source, "AUTO");
  assert.equal(created[0]!.employerId, "emp-1");
  assert.equal(created[0]!.matchScore, 87);
  assert.equal(created[0]!.matchWeightsVersion, "hybrid-v2");
  assert.deepEqual(notified, [{ userId: "user-cand-1", db: TX }]);
  assert.deepEqual(recorded, [["co-1", "AUTO"]]);
});

test("không truyền điểm: chấm lại lúc gửi; chấm lỗi thì lời mời vẫn tạo, không lưu điểm (D7)", async () => {
  const { service, log, created } = buildService();
  const result = await service.createInvitation(input({ match: undefined, source: "MANUAL" }));
  assert.equal(result.created, true);
  assert.ok(log.indexOf("score") < log.indexOf("tx"), "chấm điểm trước transaction, không giữ khoá lúc chấm");
  assert.equal(created[0]!.matchScore, null);
  assert.equal(created[0]!.source, "MANUAL");
});

const SKIP_CASES: { name: string; state: Partial<State>; source?: "MANUAL" | "AUTO"; reason: InvitationSkipReason }[] = [
  { name: "không có ứng viên", state: { candidate: null }, reason: "NOT_FOUND" },
  { name: "ứng viên tắt cho phép mời", state: { candidate: { id: "cand-1", userId: "u", isOpenToOutreach: false } }, reason: "NOT_OPEN" },
  { name: "đã ứng tuyển", state: { applied: true }, reason: "APPLIED" },
  { name: "đã có lời mời đang chặn (Q4)", state: { blocked: { outside: true, inside: true } }, reason: "BLOCKED" },
  {
    name: "ứng viên đã nhận đủ trần trong ngày",
    state: { received: { outside: CANDIDATE_DAILY_INVITATION_CAP, inside: CANDIDATE_DAILY_INVITATION_CAP } },
    reason: "CANDIDATE_CAP",
  },
  { name: "hết tổng hạn mức (mời tay)", state: { usage: { total: 14, auto: 0 } }, source: "MANUAL", reason: "QUOTA" },
  { name: "hết phần tự động", state: { usage: { total: 11, auto: 11 } }, source: "AUTO", reason: "QUOTA" },
];

for (const testCase of SKIP_CASES) {
  test(`bỏ qua — ${testCase.name}: trả ${testCase.reason}, không mở transaction, không tính lượt`, async () => {
    const { service, log, created, recorded } = buildService(testCase.state);
    const result = await service.createInvitation(input({ source: testCase.source ?? "AUTO" }));
    assert.deepEqual(result, { created: false, reason: testCase.reason });
    assert.equal(log.includes("tx"), false);
    assert.equal(created.length, 0);
    assert.equal(recorded.length, 0);
  });
}

test("kiểm lại dưới khoá: lượt mời khác vừa tạo lời mời cho cặp này ⇒ BLOCKED, không tạo", async () => {
  const { service, created, recorded, notified } = buildService({ blocked: { outside: false, inside: true } });
  assert.deepEqual(await service.createInvitation(input()), { created: false, reason: "BLOCKED" });
  assert.equal(created.length, 0);
  assert.equal(notified.length, 0);
  assert.equal(recorded.length, 0);
});

test("kiểm lại dưới khoá: công ty khác vừa mời làm ứng viên đủ trần ⇒ CANDIDATE_CAP, không tạo", async () => {
  const { service, created, recorded } = buildService({
    received: { outside: CANDIDATE_DAILY_INVITATION_CAP - 1, inside: CANDIDATE_DAILY_INVITATION_CAP },
  });
  assert.deepEqual(await service.createInvitation(input()), { created: false, reason: "CANDIDATE_CAP" });
  assert.equal(created.length, 0);
  assert.equal(recorded.length, 0);
});

test("dưới trần một lời mời vẫn mời được", async () => {
  const { service } = buildService({
    received: { outside: CANDIDATE_DAILY_INVITATION_CAP - 1, inside: CANDIDATE_DAILY_INVITATION_CAP - 1 },
  });
  assert.equal((await service.createInvitation(input())).created, true);
});

// ─── Mời tay: lý do ⇒ lỗi HTTP ─────────────────────────────────────────────

test("inviteSkipError: giữ mã lỗi cũ của AD-15; trần ứng viên ⇒ 409, hết hạn mức ⇒ 429 kèm số", () => {
  const status = (reason: InvitationSkipReason) => inviteSkipError(reason, 8).statusCode;
  assert.equal(status("NOT_FOUND"), 404);
  assert.equal(status("NOT_OPEN"), 403);
  assert.equal(status("APPLIED"), 409);
  assert.equal(status("BLOCKED"), 409);
  assert.equal(status("CANDIDATE_CAP"), 409);
  assert.match(inviteSkipError("CANDIDATE_CAP", 8).message, /7h sáng mai/);
  const quota = inviteSkipError("QUOTA", 8);
  assert.equal(quota.statusCode, 429);
  assert.match(quota.message, /đủ 8 lời mời/);
});

test("invite: ứng viên đủ trần ⇒ AppError 409, lời mời tay ghi nguồn MANUAL khi tạo được", async () => {
  const build = (received: number) => {
    const built = buildService({ received: { outside: received, inside: received } });
    const deps = built.service as unknown as Record<string, unknown>;
    // Phần chung của mời tay: employer, tin của chính mình đang PUBLISHED, gói Tiêu chuẩn (14/ngày).
    deps.employerIdentityCache = { require: async () => ({ employerId: "emp-1", companyId: "co-1" }) };
    Object.assign(deps.repository as object, {
      findOutreachCompany: async () => ({ id: "co-1", name: "Công ty A", verifiedAt: new Date() }),
      findJobPost: async () => ({ id: "job-1", title: JOB.title, status: "PUBLISHED", employerId: "emp-1", companyId: "co-1" }),
      findSearchCards: async () => [],
    });
    deps.subscriptionsService = { getCompanySubscriptionAccess: async () => ({ mode: "SUBSCRIBED" }) };
    deps.companySubscriptionRepository = {
      findActiveByCompany: async () => ({ plan: { outreachInvitationDailyQuota: 14, outreachPoolMultiplier: 5 } }),
    };
    return built;
  };

  await assert.rejects(build(CANDIDATE_DAILY_INVITATION_CAP).service.invite("user-emp-1", "job-1", "cand-1"), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 409);
    return true;
  });

  const ok = build(0);
  const dto = await ok.service.invite("user-emp-1", "job-1", "cand-1");
  assert.equal(dto.invitationId, "inv-1");
  assert.equal(ok.created[0]!.source, "MANUAL");
  assert.deepEqual(ok.recorded, [["co-1", "MANUAL"]]);
});

// ─── Trang tìm ứng viên ────────────────────────────────────────────────────

test("searchCandidates: người đã nhận đủ trần vẫn hiện, kèm cappedToday = true", async () => {
  const { service } = buildService();
  const deps = service as unknown as Record<string, unknown>;
  deps.employerIdentityCache = { require: async () => ({ employerId: "emp-1", companyId: "co-1" }) };
  Object.assign(deps.repository as object, {
    findOutreachCompany: async () => ({ id: "co-1", name: "Công ty A", verifiedAt: new Date() }),
    findJobPost: async () => ({ id: "job-1", title: JOB.title, status: "PUBLISHED", employerId: "emp-1", companyId: "co-1" }),
    searchCandidatePool: async () => ["cand-a", "cand-b", "cand-c"],
    findSearchCards: async (ids: string[]) =>
      ids.map((id) => ({ candidateId: id, fullName: id, avatarUrl: null, headline: null, cityName: null, education: null })),
    findExpiredInvitedCandidateIds: async () => new Set<string>(),
    countReceivedTodayByCandidate: async () =>
      new Map([
        ["cand-a", CANDIDATE_DAILY_INVITATION_CAP],
        ["cand-b", CANDIDATE_DAILY_INVITATION_CAP - 1],
      ]),
  });
  deps.subscriptionsService = { getCompanySubscriptionAccess: async () => ({ mode: "TRIAL" }) };
  deps.jobMatchProfileLoader = { load: async () => ({ jobPostId: "job-1", matchText: "" }) };
  deps.candidateMatchProfileLoader = {
    loadMany: async (ids: string[]) => new Map(ids.map((id) => [id, { candidateId: id, skills: [] }])),
  };
  const scoreById: Record<string, number> = { "cand-a": 90, "cand-b": 80, "cand-c": 70 };
  deps.ruleJobMatcher = {
    match: ({ candidate }: { candidate: { candidateId: string } }) => ({ score: scoreById[candidate.candidateId] }),
  };

  const results = await service.searchCandidates("user-emp-1", "job-1");
  assert.deepEqual(
    results.map((result) => [result.candidateId, result.cappedToday]),
    [
      ["cand-a", true],
      ["cand-b", false],
      ["cand-c", false],
    ],
  );
});

test("searchCandidates: tin đã chấm ⇒ lấy 10 người từ bảng (không lọc trần ngày), không lọc pool, chấm lại và sắp theo điểm mới", async () => {
  const { service } = buildService();
  const deps = service as unknown as Record<string, unknown>;
  const scoredCalls: unknown[][] = [];
  let poolCalled = false;
  deps.employerIdentityCache = { require: async () => ({ employerId: "emp-1", companyId: "co-1" }) };
  Object.assign(deps.repository as object, {
    findOutreachCompany: async () => ({ id: "co-1", name: "Công ty A", verifiedAt: new Date() }),
    findJobPost: async () => ({
      id: "job-1",
      title: JOB.title,
      status: "PUBLISHED",
      employerId: "emp-1",
      companyId: "co-1",
      matchScoresAt: new Date("2026-11-14T03:30:00.000Z"),
    }),
    searchCandidatePool: async () => {
      poolCalled = true;
      return [];
    },
    findSearchCards: async (ids: string[]) =>
      ids.map((id) => ({ candidateId: id, fullName: id, avatarUrl: null, headline: null, cityName: null, education: null })),
    findExpiredInvitedCandidateIds: async () => new Set<string>(),
    countReceivedTodayByCandidate: async () => new Map([["cand-b", CANDIDATE_DAILY_INVITATION_CAP]]),
  });
  // Thứ tự của bảng (điểm lưu giảm dần): a, b, c, d.
  deps.autoOutreachRepository = {
    findScoredQueue: async (...args: unknown[]) => {
      scoredCalls.push(args);
      return ["cand-a", "cand-b", "cand-c", "cand-d"].map((candidateId) => ({ candidateId, score: 0, weightsVersion: "hybrid-v2" }));
    },
  };
  deps.subscriptionsService = { getCompanySubscriptionAccess: async () => ({ mode: "TRIAL" }) };
  deps.jobMatchProfileLoader = { load: async () => ({ jobPostId: "job-1", matchText: "" }) };
  deps.candidateMatchProfileLoader = {
    loadMany: async (ids: string[]) => new Map(ids.map((id) => [id, { candidateId: id, skills: [] }])),
  };
  // Điểm vừa chấm: c tăng lên đầu; a và d bằng điểm ⇒ giữ thứ tự của bảng.
  const scoreById: Record<string, number> = { "cand-a": 80, "cand-b": 85, "cand-c": 95, "cand-d": 80 };
  deps.ruleJobMatcher = {
    match: ({ candidate }: { candidate: { candidateId: string } }) => ({ score: scoreById[candidate.candidateId] }),
  };

  const results = await service.searchCandidates("user-emp-1", "job-1");
  assert.deepEqual(scoredCalls, [["job-1", 0, 10, { includeCappedToday: true }]], "không lọc ngưỡng, tối đa 10, giữ người đủ trần");
  assert.equal(poolCalled, false, "không đi pool 50");
  assert.deepEqual(
    results.map((result) => [result.candidateId, result.cappedToday]),
    [
      ["cand-c", false],
      ["cand-b", true],
      ["cand-a", false],
      ["cand-d", false],
    ],
  );
});
