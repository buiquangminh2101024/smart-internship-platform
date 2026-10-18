// Chạy: node --import tsx --test tests/unit/job-post-resubmit.test.ts (từ apps/server)
// `metadata.resubmit` của dòng nhật ký gửi tin (docs/06-backend/admin-audit-log/PLAN.md L28):
// đếm dòng SUBMITTED có sẵn trong job_post_moderation_actions TRƯỚC khi thêm dòng mới.
// Repository là bản giả giữ danh sách dòng moderation trong bộ nhớ.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ModerationActionType } from "@prisma/client";
import { JobPostsService } from "../../src/modules/job-posts/job-posts.service";

const TX = { tx: true };
const EMPLOYER = { employerId: "emp-1", userId: "user-emp-1", companyId: "co-1" };

function buildService(options: { requiresApproval: boolean; history: ModerationActionType[] }) {
  const moderation = options.history.map((action) => ({ jobPostId: "job-1", action }));
  const audits: Array<{ action: string; metadata?: unknown }> = [];
  const company = { id: "co-1", name: "Công ty A", isVerified: true, requiresApproval: options.requiresApproval, verifiedAt: new Date() };
  const jobPost = {
    id: "job-1",
    companyId: "co-1",
    company: { ...company, logoUrl: null, website: null, industryId: null, cityId: null, address: null, taxCode: null, description: null },
    title: "Thực tập sinh Backend",
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
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    closedAt: null,
    viewCount: 0,
    minExperienceYears: null,
    requirementsExtra: null,
    requirementsConfirmedAt: null,
    moderationActions: [],
    skills: [{ skill: { id: "sk-1", name: "Node.js", status: "APPROVED" }, importance: "REQUIRED", minYears: null }],
    majors: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const service = new JobPostsService({
    prisma: { $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(TX) },
    jobPostRepository: {
      findById: async () => jobPost,
      countModerationActions: async (jobPostId: string, action: ModerationActionType, db: unknown) => {
        assert.equal(db, TX, "phải đếm trong transaction");
        return moderation.filter((row) => row.jobPostId === jobPostId && row.action === action).length;
      },
      createModerationAction: async (data: { jobPostId: string; action: ModerationActionType }) => {
        moderation.push({ jobPostId: data.jobPostId, action: data.action });
      },
      update: async (_id: string, data: object) => ({ ...jobPost, ...data }),
    },
    employerIdentityCache: { require: async () => EMPLOYER },
    companyRepository: { findById: async () => company },
    subscriptionsService: { getCompanySubscriptionAccess: async () => ({ mode: "SUBSCRIBED" }) },
    notificationsService: { notifyMany: async () => {} },
    userRepository: { findAdminIds: async () => ["admin-1"] },
    auditLogService: {
      record: async (entry: { action: string; metadata?: unknown }, tx: unknown) => {
        assert.equal(tx, TX);
        audits.push({ action: entry.action, metadata: entry.metadata });
      },
    },
  } as unknown as ConstructorParameters<typeof JobPostsService>[0]);
  return { service, audits };
}

test("gửi duyệt lần đầu ⇒ resubmit false", async () => {
  const { service, audits } = buildService({ requiresApproval: true, history: [] });
  await service.submitForApproval(EMPLOYER.userId, "job-1");
  assert.deepEqual(audits, [{ action: "JOB_POST_SUBMITTED", metadata: { resubmit: false } }]);
});

test("bị từ chối rồi gửi lại ⇒ resubmit true", async () => {
  const { service, audits } = buildService({ requiresApproval: true, history: ["SUBMITTED", "REJECTED"] });
  await service.submitForApproval(EMPLOYER.userId, "job-1");
  assert.deepEqual(audits, [{ action: "JOB_POST_SUBMITTED", metadata: { resubmit: true } }]);
});

test("tự đăng (công ty không cần duyệt) sau khi bị từ chối ⇒ resubmit true", async () => {
  const { service, audits } = buildService({ requiresApproval: false, history: ["SUBMITTED", "REJECTED"] });
  const result = await service.submitForApproval(EMPLOYER.userId, "job-1");
  assert.equal(result.autoPublished, true);
  assert.deepEqual(audits, [{ action: "JOB_POST_AUTO_PUBLISHED", metadata: { resubmit: true } }]);
});

test("tự đăng lần đầu ⇒ resubmit false", async () => {
  const { service, audits } = buildService({ requiresApproval: false, history: [] });
  await service.submitForApproval(EMPLOYER.userId, "job-1");
  assert.deepEqual(audits, [{ action: "JOB_POST_AUTO_PUBLISHED", metadata: { resubmit: false } }]);
});
