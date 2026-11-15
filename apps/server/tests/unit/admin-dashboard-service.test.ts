// Chạy: node --import tsx --test tests/unit/admin-dashboard-service.test.ts (từ apps/server)
// Service dashboard Admin chuyển đúng các trường của bản D (D14): mốc chờ lâu nhất
// của ba hàng chờ, nhóm thời gian chờ theo giờ của tin. Repository là bản giả; SQL
// không được kiểm ở đây. (Test "tasks:" bỏ cùng GET /admin/dashboard/tasks ở bản D2.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { AdminDashboardService } from "../../src/modules/dashboard/admin-dashboard.service";

const WAIT = { under24h: 1, oneToTwoDays: 0, over2Days: 0 };

function buildService(options: { emptyJobQueue?: boolean } = {}) {
  const dashboardRepository = {
    companyQueueSummary: async () => ({ total: 1, wait: WAIT, oldestSince: new Date("2026-09-29T02:00:00Z") }),
    jobPostQueueSummary: async () =>
      options.emptyJobQueue
        ? { total: 0, wait: { under6h: 0, sixTo24h: 0, over24h: 0 }, oldestSince: null }
        : { total: 3, wait: { under6h: 1, sixTo24h: 2, over24h: 0 }, oldestSince: new Date("2026-09-29T15:00:00Z") },
    catalogQueueSummary: async () => ({
      total: 3,
      skills: 2,
      universities: 1,
      majors: 0,
      wait: WAIT,
      oldestSince: new Date("2026-09-28T00:00:00Z"),
    }),
    newUsersLast7Days: async () => ({ current: 0, previous: 0 }),
    revenueThisMonth: async () => ({ current: 0, previous: 0 }),
    activeSubscriptions: async () => ({ active: 0, expiringSoon: 0, byPlan: [] }),
  };
  const service = new AdminDashboardService({
    dashboardRepository,
  } as unknown as ConstructorParameters<typeof AdminDashboardService>[0]);
  return { service };
}

test("overview: mỗi hàng chờ có oldestSince (ISO), tin dùng nhóm theo giờ", async () => {
  const { queues } = await buildService().service.overview();
  assert.equal(queues.companies.oldestSince, "2026-09-29T02:00:00.000Z");
  assert.equal(queues.catalog.oldestSince, "2026-09-28T00:00:00.000Z");
  assert.equal(queues.jobPosts.oldestSince, "2026-09-29T15:00:00.000Z");
  assert.deepEqual(queues.jobPosts.wait, { under6h: 1, sixTo24h: 2, over24h: 0 });
  assert.deepEqual(queues.companies.wait, WAIT);
});

test("overview: hàng chờ trống thì oldestSince là null", async () => {
  const { queues } = await buildService({ emptyJobQueue: true }).service.overview();
  assert.equal(queues.jobPosts.oldestSince, null);
});
