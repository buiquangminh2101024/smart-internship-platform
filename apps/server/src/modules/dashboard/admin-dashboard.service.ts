import type {
  AdminDashboardAnalytics,
  AdminDashboardOverview,
  AdminDashboardTasks,
  DashboardRange,
} from "@sip/shared-types";
import type { DashboardRepository } from "./dashboard.repository";

/** Mỗi hàng chờ hiện tối đa bấy nhiêu mục, còn lại là "Xem tất cả". */
const TASK_LIMIT = 5;
const SUBSCRIPTION_EXPIRING_DAYS = 7;

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
      queues: { companies, jobPosts, catalog },
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
        items: catalog.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
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
