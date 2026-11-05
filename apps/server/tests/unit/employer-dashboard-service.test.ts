// Chạy: node --import tsx --test tests/unit/employer-dashboard-service.test.ts (từ apps/server)
// Service dashboard Employer chuyển đúng các trường (số ứng viên có tin chưa đọc,
// tin cần chú ý, phỏng vấn) từ repository ra response. Repository và các
// service phụ thuộc đều là bản giả; SQL không được kiểm ở đây.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EmployerDashboardService } from "../../src/modules/dashboard/employer-dashboard.service";

const EMPLOYER = { userId: "user-emp-1", employerId: "emp-1", companyId: "co-1" };
const COMPANY = { id: "co-1", name: "Công ty A", verificationStatus: "VERIFIED" };
const QUOTA = { mode: "SUBSCRIBED", dailyQuota: 20, usedToday: 20, remainingToday: 0 };

function buildService() {
  const dashboardRepository = {
    applicationSummary: async () => ({
      newLast7Days: { current: 2, previous: 1 },
      pendingCount: 1,
      oldestPendingSince: new Date("2026-09-27T01:00:00Z"),
    }),
    countUnreadCandidates: async () => 2,
    listUnreadConversations: async () => [],
    applicationsDaily: async () => [{ date: "2026-11-04", value: 3 }],
    viewsDaily: async () => [{ date: "2026-11-04", value: 40 }],
  };
  const interviewsService = {
    upcomingForCompany: async () => ({ total: 2, items: [] }),
    pastWeekCountForCompany: async () => 1,
    nextForCompany: async () => null,
  };
  return new EmployerDashboardService({
    dashboardRepository,
    employerIdentityCache: { require: async () => EMPLOYER },
    companyRepository: { findById: async () => COMPANY },
    jobPostsService: {
      ownStats: async () => ({}),
      attentionSummaryForCompany: async () => ({ total: 3, rejected: 1, expiringIn7Days: 2 }),
    },
    candidateOutreachService: { getDailyQuotaStatus: async () => QUOTA },
    // 3 hội thoại chưa đọc nhưng chỉ từ 2 ứng viên.
    messagingService: { getUnreadSummary: async () => ({ count: 3 }) },
    interviewsService,
  } as unknown as ConstructorParameters<typeof EmployerDashboardService>[0]);
}

test("overview: số ứng viên có tin chưa đọc tách khỏi số hội thoại", async () => {
  const overview = await buildService().overview("user-1");
  assert.equal(overview.messages.unreadConversations, 3);
  assert.equal(overview.messages.unreadCandidates, 2);
});

test("overview: tin cần chú ý lấy từ job-posts; còn số hồ sơ chờ (menu) và hạn mức lời mời (dòng nhắc)", async () => {
  const overview = await buildService().overview("user-1");
  assert.deepEqual(overview.jobs.attention, { total: 3, rejected: 1, expiringIn7Days: 2 });
  assert.equal(overview.applications.pendingCount, 1);
  assert.deepEqual(overview.outreach, { quota: QUOTA });
  // Trường của bản C đã bỏ ở đợt 2 (employer-dashboard-v2).
  assert.equal("expiringIn7Days" in overview.jobs, false);
  assert.equal("topJob" in overview.jobs, false);
  assert.equal("pendingWait" in overview.applications, false);
  assert.equal("next7Days" in overview.interviews, false);
});

test("overview: phỏng vấn 7 ngày qua đặt cạnh 7 ngày tới", async () => {
  const overview = await buildService().overview("user-1");
  assert.equal(overview.interviews.upcomingCount, 2);
  assert.equal(overview.interviews.last7Days, 1);
});

test("analytics: chỉ còn hồ sơ và lượt xem theo ngày", async () => {
  const analytics = await buildService().analytics("user-1", 30);
  assert.deepEqual(Object.keys(analytics).sort(), ["applicationsDaily", "range", "viewsDaily"]);
});
