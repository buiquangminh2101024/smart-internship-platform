// Chạy: node --import tsx --test tests/unit/employer-dashboard-service.test.ts (từ apps/server)
// Service dashboard Employer chuyển đúng các trường mới (tên trường, số hồ sơ của
// tin, số ứng viên có tin chưa đọc) từ repository ra response. Repository và các
// service phụ thuộc đều là bản giả; SQL không được kiểm ở đây.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EmployerDashboardService } from "../../src/modules/dashboard/employer-dashboard.service";

const EMPLOYER = {
  id: "emp-1",
  companyId: "co-1",
  company: { id: "co-1", name: "Công ty A", verificationStatus: "VERIFIED" },
};
const WAIT = { under24h: 0, oneToTwoDays: 0, over2Days: 1 };

function buildService() {
  const dashboardRepository = {
    applicationSummary: async () => ({
      newLast7Days: { current: 2, previous: 1 },
      pendingCount: 1,
      pendingWait: WAIT,
      oldestPendingSince: new Date("2026-09-27T01:00:00Z"),
    }),
    listPendingApplications: async () => [
      {
        applicationId: "app-1",
        candidateName: "Lê Hoàng Nam",
        candidateAvatarUrl: null,
        universityName: "ĐH Bách khoa TP.HCM",
        jobPostId: "job-1",
        jobPostTitle: "Thực tập sinh Frontend",
        waitingSince: new Date("2026-09-27T01:00:00Z"),
      },
    ],
    listExpiringJobs: async () => ({
      total: 1,
      items: [{ jobPostId: "job-1", title: "Thực tập sinh Frontend", expiresAt: new Date("2026-10-02T00:00:00Z"), applicationCount: 41 }],
    }),
    listRejectedJobs: async () => ({
      total: 1,
      items: [
        { jobPostId: "job-2", title: "Thực tập sinh QA", rejectedReason: "thiếu mô tả quyền lợi", rejectedAt: new Date("2026-09-28T00:00:00Z"), applicationCount: 0 },
      ],
    }),
    countExpiringJobs: async () => 1,
    findTopPublishedJob: async () => null,
    countUnreadCandidates: async () => 2,
    listUnreadConversations: async () => [],
    outreachLast30Days: async () => ({ sent: 0, accepted: 0, declined: 0 }),
    interviewsNext7Days: async () => [],
  };
  const interviewsService = {
    awaitingForCompany: async () => ({ total: 0, items: [] }),
    upcomingForCompany: async () => ({ total: 0, items: [] }),
    nextForCompany: async () => null,
  };
  return new EmployerDashboardService({
    dashboardRepository,
    employerRepository: { findByUserId: async () => EMPLOYER },
    jobPostsService: { ownStats: async () => ({}) },
    candidateOutreachService: { getDailyQuotaStatus: async () => ({}) },
    // 3 hội thoại chưa đọc nhưng chỉ từ 2 ứng viên.
    messagingService: { getUnreadSummary: async () => ({ count: 3 }) },
    interviewsService,
  } as unknown as ConstructorParameters<typeof EmployerDashboardService>[0]);
}

test("tasks: hồ sơ chờ có tên trường, tin cần chú ý có số hồ sơ", async () => {
  const tasks = await buildService().tasks("user-1");
  assert.equal(tasks.pendingApplications.items[0]?.universityName, "ĐH Bách khoa TP.HCM");
  assert.deepEqual(
    tasks.attentionJobs.items.map((job) => [job.kind, job.applicationCount]),
    [
      ["EXPIRING", 41],
      ["REJECTED", 0],
    ],
  );
});

test("overview: số ứng viên có tin chưa đọc tách khỏi số hội thoại", async () => {
  const overview = await buildService().overview("user-1");
  assert.equal(overview.messages.unreadConversations, 3);
  assert.equal(overview.messages.unreadCandidates, 2);
});
