import type {
  AdminDashboardAnalytics,
  AdminDashboardOverview,
  DashboardRange,
} from "@sip/shared-types";
import type { DashboardRepository, QueueSummaryRow } from "./dashboard.repository";

const SUBSCRIPTION_EXPIRING_DAYS = 7;

function withIsoOldest<Q extends QueueSummaryRow<unknown>>(queue: Q): Omit<Q, "oldestSince"> & { oldestSince: string | null } {
  return { ...queue, oldestSince: queue.oldestSince?.toISOString() ?? null };
}

/** Dashboard Admin (AD-16) — chỉ đọc, số liệu toàn hệ thống. */
export class AdminDashboardService {
  private readonly dashboardRepository: DashboardRepository;

  constructor({ dashboardRepository }: { dashboardRepository: DashboardRepository }) {
    this.dashboardRepository = dashboardRepository;
  }

  async overview(): Promise<AdminDashboardOverview> {
    const [companies, jobPosts, catalog, newUsers, revenue, subscriptions] = await Promise.all([
      this.dashboardRepository.companyQueueSummary(),
      this.dashboardRepository.jobPostQueueSummary(),
      this.dashboardRepository.catalogQueueSummary(),
      this.dashboardRepository.newUsersLast7Days(),
      this.dashboardRepository.revenueThisMonth(),
      this.dashboardRepository.activeSubscriptions(SUBSCRIPTION_EXPIRING_DAYS),
    ]);
    return {
      queues: {
        companies: withIsoOldest(companies),
        jobPosts: withIsoOldest(jobPosts),
        catalog: withIsoOldest(catalog),
      },
      users: { newLast7Days: newUsers },
      revenue: { thisMonth: revenue },
      subscriptions: {
        active: subscriptions.active,
        expiringIn7Days: subscriptions.expiringSoon,
        byPlan: subscriptions.byPlan,
      },
    };
  }

  async analytics(range: DashboardRange): Promise<AdminDashboardAnalytics> {
    const [newUsersDaily, revenueWeekly, usersByRole] = await Promise.all([
      this.dashboardRepository.newUsersDaily(range),
      this.dashboardRepository.revenueWeekly(),
      this.dashboardRepository.usersByRole(),
    ]);
    return { range, newUsersDaily, revenueWeekly, usersByRole };
  }
}
