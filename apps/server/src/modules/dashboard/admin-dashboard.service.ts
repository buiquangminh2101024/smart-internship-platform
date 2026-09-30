import type {
  AdminDashboardAnalytics,
  AdminDashboardOverview,
  AdminDashboardTasks,
  DashboardRange,
} from "@sip/shared-types";
import type { UserRepository } from "../users/user.repository";
import type { DashboardRepository, QueueSummaryRow } from "./dashboard.repository";

/** Mỗi hàng chờ hiện tối đa bấy nhiêu mục, còn lại là "Xem tất cả". */
const TASK_LIMIT = 5;
const SUBSCRIPTION_EXPIRING_DAYS = 7;

function withIsoOldest<Q extends QueueSummaryRow<unknown>>(queue: Q): Omit<Q, "oldestSince"> & { oldestSince: string | null } {
  return { ...queue, oldestSince: queue.oldestSince?.toISOString() ?? null };
}

/** Dashboard Admin (AD-16) — chỉ đọc, số liệu toàn hệ thống. */
export class AdminDashboardService {
  private readonly dashboardRepository: DashboardRepository;
  private readonly userRepository: UserRepository;

  constructor({ dashboardRepository, userRepository }: { dashboardRepository: DashboardRepository; userRepository: UserRepository }) {
    this.dashboardRepository = dashboardRepository;
    this.userRepository = userRepository;
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

  async tasks(): Promise<AdminDashboardTasks> {
    const [jobPostQueue, companyQueue, catalogQueue, jobPosts, companies, catalog] = await Promise.all([
      this.dashboardRepository.jobPostQueueSummary(),
      this.dashboardRepository.companyQueueSummary(),
      this.dashboardRepository.catalogQueueSummary(),
      this.dashboardRepository.listPendingJobPosts(TASK_LIMIT),
      this.dashboardRepository.listPendingCompanies(TASK_LIMIT),
      this.dashboardRepository.listPendingCatalogEntries(TASK_LIMIT),
    ]);
    const suggesterIds = [...new Set(catalog.flatMap((entry) => (entry.createdByUserId ? [entry.createdByUserId] : [])))];
    const suggesters = await this.userRepository.findCatalogSuggesters(suggesterIds);
    return {
      jobPosts: {
        total: jobPostQueue.total,
        items: jobPosts.map((jobPost) => ({ ...jobPost, submittedAt: jobPost.submittedAt.toISOString() })),
      },
      companies: {
        total: companyQueue.total,
        items: companies.map((company) => ({ ...company, submittedAt: company.submittedAt.toISOString() })),
      },
      catalog: {
        total: catalogQueue.total,
        items: catalog.map(({ createdByUserId, ...entry }) => ({
          ...entry,
          createdAt: entry.createdAt.toISOString(),
          suggestedBy: createdByUserId ? (suggesters.get(createdByUserId) ?? null) : null,
        })),
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
