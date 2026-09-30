// Chạy: node --import tsx --test tests/unit/admin-dashboard-service.test.ts (từ apps/server)
// Service dashboard Admin chuyển đúng các trường của bản D (D14): mốc chờ lâu nhất
// của ba hàng chờ, nhóm thời gian chờ theo giờ của tin, người đề xuất mục danh
// mục. Repository là bản giả; SQL không được kiểm ở đây.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CatalogSuggester } from "@sip/shared-types";
import { AdminDashboardService } from "../../src/modules/dashboard/admin-dashboard.service";

const WAIT = { under24h: 1, oneToTwoDays: 0, over2Days: 0 };

function buildService(options: { emptyJobQueue?: boolean } = {}) {
  const requestedSuggesterIds: string[][] = [];
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
    listPendingJobPosts: async () => [],
    listPendingCompanies: async () => [],
    listPendingCatalogEntries: async () => [
      { id: "s-1", kind: "SKILL", name: "Figma Prototyping", createdAt: new Date("2026-09-28T00:00:00Z"), createdByUserId: "u-emp" },
      { id: "s-2", kind: "SKILL", name: "Rust", createdAt: new Date("2026-09-28T01:00:00Z"), createdByUserId: "u-emp" },
      { id: "u-1", kind: "UNIVERSITY", name: "ĐH Mở", createdAt: new Date("2026-09-28T02:00:00Z"), createdByUserId: null },
    ],
  };
  const userRepository = {
    findCatalogSuggesters: async (ids: string[]) => {
      requestedSuggesterIds.push(ids);
      return new Map<string, CatalogSuggester>([["u-emp", { name: "Lạc Việt Tech", role: "EMPLOYER" }]]);
    },
  };
  const service = new AdminDashboardService({
    dashboardRepository,
    userRepository,
  } as unknown as ConstructorParameters<typeof AdminDashboardService>[0]);
  return { service, requestedSuggesterIds };
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

test("tasks: mục danh mục có suggestedBy, không lộ createdByUserId, tra tên một lần cho mỗi người", async () => {
  const { service, requestedSuggesterIds } = buildService();
  const { catalog } = await service.tasks();
  assert.deepEqual(
    catalog.items.map((item) => item.suggestedBy),
    [{ name: "Lạc Việt Tech", role: "EMPLOYER" }, { name: "Lạc Việt Tech", role: "EMPLOYER" }, null],
  );
  assert.ok(catalog.items.every((item) => !("createdByUserId" in item)));
  assert.deepEqual(requestedSuggesterIds, [["u-emp"]]);
});
