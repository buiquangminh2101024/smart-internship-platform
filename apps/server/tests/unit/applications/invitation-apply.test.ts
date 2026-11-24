// Chạy: node --import tsx --test tests/unit/applications/invitation-apply.test.ts (từ apps/server)
// AD-28 — nhận lời mời = ứng tuyển (docs/06-backend/invitation-apply/PLAN.md bước 8).
// Repository là bản giả có trạng thái trong bộ nhớ; transaction giả chạy thẳng callback và
// khôi phục ảnh chụp khi callback ném lỗi, để kiểm "lỗi ⇒ không ghi gì".
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApplicationStatus, OutreachInvitationStatus } from "@prisma/client";
import { ApplicationsService } from "../../../src/modules/applications/applications.service";
import { InvitationApplicationService } from "../../../src/modules/candidate-outreach/invitation-application.service";
import { AppError } from "../../../src/shared/errors/AppError";

interface AppRow {
  id: string;
  jobPostId: string;
  candidateId: string;
  cvId: string;
  status: ApplicationStatus;
  coverLetter: string | null;
  invitationId: string | null;
  reappliedAt?: Date;
}

interface InvitationRow {
  id: string;
  status: OutreachInvitationStatus;
  expiresAt: Date;
}

interface WorldOptions {
  invitationStatus?: OutreachInvitationStatus;
  invitationExpired?: boolean;
  jobStatus?: string;
  jobExpired?: boolean;
  /** userId người đăng tin; mặc định khác người mời. */
  posterUserId?: string;
  existing?: Partial<AppRow> | null;
  /** CV thuộc ứng viên khác. */
  foreignCv?: boolean;
}

const CANDIDATE = { id: "cand-1", userId: "user-cand-1", fullName: "Nguyễn Văn A" };
const DAY = 24 * 60 * 60 * 1000;

function buildWorld(options: WorldOptions = {}) {
  const state = {
    invitation: {
      id: "inv-1",
      status: options.invitationStatus ?? "PENDING",
      expiresAt: new Date(Date.now() + (options.invitationExpired ? -DAY : DAY)),
    } as InvitationRow,
    applications: [] as AppRow[],
    history: [] as Array<{ applicationId: string; fromStatus: ApplicationStatus | null; toStatus: ApplicationStatus; actorId: string | null }>,
    notified: [] as Array<{ type: string; userId: string; data: Record<string, unknown> }>,
    conversations: [] as string[],
    autoReviewed: [] as string[],
  };
  if (options.existing !== undefined && options.existing !== null) {
    state.applications.push({
      id: "app-old",
      jobPostId: "job-1",
      candidateId: CANDIDATE.id,
      cvId: "cv-old",
      status: "PENDING",
      coverLetter: null,
      invitationId: null,
      ...options.existing,
    });
  }

  const job = {
    id: "job-1",
    title: "Thực tập sinh Backend",
    status: options.jobStatus ?? "PUBLISHED",
    companyId: "co-1",
    expiresAt: new Date(Date.now() + (options.jobExpired ? -DAY : 30 * DAY)),
    employer: { userId: options.posterUserId ?? "user-poster" },
  };
  const invitationWithRelations = () => ({
    ...state.invitation,
    candidateId: CANDIDATE.id,
    companyId: "co-1",
    jobPostId: "job-1",
    employerId: "emp-inviter",
    jobPost: { id: job.id, title: job.title, status: job.status },
    company: { id: "co-1", name: "Mây Xanh", logoUrl: null },
    employer: { id: "emp-inviter", userId: "user-inviter" },
    candidate: { id: CANDIDATE.id, userId: CANDIDATE.userId, fullName: CANDIDATE.fullName },
  });

  const tx = {
    cv: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        candidateId: options.foreignCv ? "cand-other" : CANDIDATE.id,
        id: where.id,
      }),
    },
  };

  const prisma = {
    $transaction: async <T>(fn: (db: unknown) => Promise<T>): Promise<T> => {
      const snapshot = structuredClone({
        invitation: state.invitation,
        applications: state.applications,
        history: state.history,
        notified: state.notified,
      });
      try {
        return await fn(tx);
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      }
    },
    candidate: { findUnique: async () => CANDIDATE },
    jobPost: { findUnique: async () => job },
    cv: tx.cv,
  };

  const applicationsRepository = {
    findByJobAndCandidate: async (jobPostId: string, candidateId: string) =>
      state.applications.find((a) => a.jobPostId === jobPostId && a.candidateId === candidateId) ?? null,
    create: async (data: Omit<AppRow, "id">) => {
      const row: AppRow = { coverLetter: null, invitationId: null, ...data, id: `app-${state.applications.length + 1}` };
      state.applications.push(row);
      return row;
    },
    update: async (id: string, data: Partial<AppRow>) => {
      const row = state.applications.find((a) => a.id === id)!;
      Object.assign(row, data);
      return row;
    },
    createStatusHistory: async (data: (typeof state.history)[number]) => {
      state.history.push(data);
    },
    findCandidateApplicationById: async (id: string) => state.applications.find((a) => a.id === id) ?? null,
  };

  const candidateOutreachRepository = {
    findOpenPendingForJob: async () =>
      state.invitation.status === "PENDING" && state.invitation.expiresAt > new Date() && job.status === "PUBLISHED"
        ? invitationWithRelations()
        : null,
    findByIdTx: async (id: string) => (id === state.invitation.id ? invitationWithRelations() : null),
    findJobForAcceptance: async () => job,
    respondIfPending: async (_id: string, status: "ACCEPTED" | "DECLINED") => {
      if (state.invitation.status !== "PENDING" || state.invitation.expiresAt <= new Date()) return false;
      state.invitation.status = status;
      return true;
    },
    findApplicationIdByInvitation: async (invitationId: string) =>
      state.applications.find((a) => a.invitationId === invitationId)?.id ?? null,
    linkInvitationIfUnlinked: async (applicationId: string, invitationId: string) => {
      const row = state.applications.find((a) => a.id === applicationId)!;
      if (row.invitationId === null) row.invitationId = invitationId;
    },
  };

  const notificationsService = {
    notify: async (type: string, userId: string, data: Record<string, unknown>) => {
      state.notified.push({ type, userId, data });
    },
    notifyMany: async (type: string, userIds: string[], data: Record<string, unknown>) => {
      for (const userId of userIds) state.notified.push({ type, userId, data });
    },
  };

  const invitationApplicationService = new InvitationApplicationService({
    prisma,
    applicationsRepository,
    candidateOutreachRepository,
    notificationsService,
    messagingService: {
      createConversation: async (_userId: string, _role: string, jobPostId: string) => {
        state.conversations.push(jobPostId);
        return { id: "conv-1" };
      },
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  } as unknown as ConstructorParameters<typeof InvitationApplicationService>[0]);

  const applicationsService = new ApplicationsService({
    prisma,
    applicationsRepository,
    employerRepository: { findManyByCompanyId: async () => [{ userId: "user-poster" }, { userId: "user-colleague" }] },
    notificationsService,
    autoReviewTrigger: ({ applicationId }: { applicationId: string }) => state.autoReviewed.push(applicationId),
    invitationApplicationService,
  } as unknown as ConstructorParameters<typeof ApplicationsService>[0]);

  const accept = () =>
    prisma.$transaction((db) =>
      invitationApplicationService.acceptInTx(db as never, invitationWithRelations() as never, CANDIDATE.userId, {
        cvId: "cv-1",
        coverLetter: "Em rất quan tâm",
      }),
    );

  return { state, invitationApplicationService, applicationsService, accept };
}

async function assertAppError(promise: Promise<unknown>, statusCode: number) {
  await assert.rejects(promise, (error: unknown) => error instanceof AppError && error.statusCode === statusCode);
}

// ─── Nhận lời ở hộp lời mời ───────────────────────────────────────────────

test("nhận lời ⇒ lời mời ACCEPTED, đơn REVIEWING gắn lời mời, lịch sử null → REVIEWING, thông báo gộp cho người mời + người đăng tin", async () => {
  const { state, accept } = buildWorld();
  const result = await accept();

  assert.deepEqual(result, { applicationId: "app-1", linkedExisting: false });
  assert.equal(state.invitation.status, "ACCEPTED");
  assert.equal(state.applications.length, 1);
  assert.equal(state.applications[0]!.status, "REVIEWING");
  assert.equal(state.applications[0]!.invitationId, "inv-1");
  assert.equal(state.applications[0]!.coverLetter, "Em rất quan tâm");
  assert.deepEqual(state.history, [{ applicationId: "app-1", fromStatus: null, toStatus: "REVIEWING", actorId: CANDIDATE.userId }]);
  assert.deepEqual(
    state.notified.map((n) => [n.type, n.userId, n.data.applicationId]),
    [
      ["CANDIDATE_OUTREACH_INVITATION_RESPONDED", "user-inviter", "app-1"],
      ["CANDIDATE_OUTREACH_INVITATION_RESPONDED", "user-poster", "app-1"],
    ],
  );
});

test("người mời cũng là người đăng tin (lời mời tự động) ⇒ một thông báo", async () => {
  const { state, accept } = buildWorld({ posterUserId: "user-inviter" });
  await accept();
  assert.deepEqual(state.notified.map((n) => n.userId), ["user-inviter"]);
});

test("đơn cũ đã huỷ ⇒ mở lại đúng bản ghi đó ở REVIEWING, lịch sử CANCELLED → REVIEWING", async () => {
  const { state, accept } = buildWorld({ existing: { status: "CANCELLED" } });
  const result = await accept();

  assert.deepEqual(result, { applicationId: "app-old", linkedExisting: false });
  assert.equal(state.applications.length, 1);
  assert.equal(state.applications[0]!.status, "REVIEWING");
  assert.equal(state.applications[0]!.cvId, "cv-1");
  assert.equal(state.applications[0]!.invitationId, "inv-1");
  assert.ok(state.applications[0]!.reappliedAt instanceof Date);
  assert.deepEqual(state.history.map((h) => [h.fromStatus, h.toStatus]), [["CANCELLED", "REVIEWING"]]);
});

test("Q4 — đã có đơn đang xét ⇒ chỉ gắn lời mời, không đổi trạng thái đơn, chỉ báo người mời như cũ", async () => {
  const { state, accept } = buildWorld({ existing: { status: "SHORTLISTED" } });
  const result = await accept();

  assert.deepEqual(result, { applicationId: "app-old", linkedExisting: true });
  assert.equal(state.invitation.status, "ACCEPTED");
  assert.equal(state.applications.length, 1);
  assert.equal(state.applications[0]!.status, "SHORTLISTED");
  assert.equal(state.applications[0]!.invitationId, "inv-1");
  assert.deepEqual(state.history, []);
  assert.deepEqual(
    state.notified.map((n) => [n.userId, n.data.applicationId]),
    [["user-inviter", undefined]],
  );
});

test("CV không thuộc ứng viên ⇒ 400, lời mời vẫn PENDING, không có đơn hay thông báo", async () => {
  const { state, accept } = buildWorld({ foreignCv: true });
  await assertAppError(accept(), 400);
  assert.equal(state.invitation.status, "PENDING");
  assert.deepEqual(state.applications, []);
  assert.deepEqual(state.notified, []);
});

test("tin vừa đóng hoặc quá hạn ⇒ 409, không ghi gì", async () => {
  for (const options of [{ jobStatus: "CLOSED" }, { jobExpired: true }]) {
    const { state, accept } = buildWorld(options);
    await assertAppError(accept(), 409);
    assert.equal(state.invitation.status, "PENDING");
    assert.deepEqual(state.applications, []);
  }
});

test("lời mời không còn PENDING (đã trả lời / hết hạn) ⇒ 409, không tạo đơn", async () => {
  for (const options of [{ invitationStatus: "DECLINED" as const }, { invitationExpired: true }]) {
    const { state, accept } = buildWorld(options);
    await assertAppError(accept(), 409);
    assert.deepEqual(state.applications, []);
  }
});

// ─── "Ứng tuyển ngay" cho lời mời đã nhận theo kiểu cũ ────────────────────

test("lời mời ACCEPTED chưa có đơn ⇒ tạo đơn REVIEWING gắn lời mời; gọi lần hai ⇒ 409", async () => {
  const { state, invitationApplicationService } = buildWorld({ invitationStatus: "ACCEPTED" });
  const result = await invitationApplicationService.applyFromAccepted(CANDIDATE.userId, "inv-1", { cvId: "cv-1" });

  assert.deepEqual(result, { applicationId: "app-1" });
  assert.equal(state.applications[0]!.status, "REVIEWING");
  assert.equal(state.applications[0]!.invitationId, "inv-1");
  assert.equal(state.notified.length, 2);

  await assertAppError(invitationApplicationService.applyFromAccepted(CANDIDATE.userId, "inv-1", { cvId: "cv-1" }), 409);
  assert.equal(state.applications.length, 1);
});

test("ứng tuyển từ lời mời: lời mời còn PENDING ⇒ 409; đã có đơn khác vào tin ⇒ 409; lời mời của người khác ⇒ 404", async () => {
  const pending = buildWorld();
  await assertAppError(pending.invitationApplicationService.applyFromAccepted(CANDIDATE.userId, "inv-1", { cvId: "cv-1" }), 409);

  const applied = buildWorld({ invitationStatus: "ACCEPTED", existing: { status: "PENDING" } });
  await assertAppError(applied.invitationApplicationService.applyFromAccepted(CANDIDATE.userId, "inv-1", { cvId: "cv-1" }), 409);

  const missing = buildWorld({ invitationStatus: "ACCEPTED" });
  await assertAppError(missing.invitationApplicationService.applyFromAccepted(CANDIDATE.userId, "inv-x", { cvId: "cv-1" }), 404);
});

// ─── Nộp đơn thường (ApplicationsService.createApplication) ───────────────

test("Q4 — nộp đơn thường khi có lời mời đang chờ ⇒ coi như nhận lời: REVIEWING, không APPLICATION_RECEIVED, không tự xét, mở hội thoại", async () => {
  const { state, applicationsService } = buildWorld();
  const app = (await applicationsService.createApplication(CANDIDATE.userId, { jobPostId: "job-1", cvId: "cv-1" })) as unknown as AppRow;

  assert.equal(app.status, "REVIEWING");
  assert.equal(app.invitationId, "inv-1");
  assert.equal(state.invitation.status, "ACCEPTED");
  assert.ok(state.notified.every((n) => n.type === "CANDIDATE_OUTREACH_INVITATION_RESPONDED"));
  assert.deepEqual(state.autoReviewed, []);
  assert.deepEqual(state.conversations, ["job-1"]);
});

test("nộp đơn thường không có lời mời (hoặc lời mời đã hết hạn) ⇒ như cũ: PENDING, APPLICATION_RECEIVED cho cả công ty, tự xét", async () => {
  for (const options of [{ invitationStatus: "DECLINED" as const }, { invitationExpired: true }]) {
    const { state, applicationsService } = buildWorld(options);
    const app = (await applicationsService.createApplication(CANDIDATE.userId, { jobPostId: "job-1", cvId: "cv-1" })) as unknown as AppRow;

    assert.equal(app.status, "PENDING");
    assert.equal(app.invitationId, null);
    assert.deepEqual(state.history.map((h) => [h.fromStatus, h.toStatus]), [[null, "PENDING"]]);
    assert.deepEqual(
      state.notified.map((n) => [n.type, n.userId]),
      [
        ["APPLICATION_RECEIVED", "user-poster"],
        ["APPLICATION_RECEIVED", "user-colleague"],
      ],
    );
    assert.deepEqual(state.autoReviewed, [app.id]);
    assert.deepEqual(state.conversations, []);
  }
});
