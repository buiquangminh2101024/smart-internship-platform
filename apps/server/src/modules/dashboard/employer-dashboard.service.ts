import type { DashboardRange, EmployerDashboardAnalytics, EmployerDashboardOverview } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { CandidateOutreachService } from "../candidate-outreach/candidate-outreach.service";
import type { CompanyRepository } from "../companies/company.repository";
import type { EmployerIdentityCache } from "../employers/employer-identity-cache";
import type { InterviewsService } from "../interviews/interviews.service";
import type { JobPostsService } from "../job-posts/job-posts.service";
import type { MessagingService } from "../messaging/messaging.service";
import type { DashboardRepository } from "./dashboard.repository";

const RECENT_CONVERSATION_LIMIT = 3;

/**
 * Dashboard Employer (AD-16) — chỉ đọc. Số liệu tính cho cả công ty của
 * employer, trừ tin nhắn (hội thoại gắn với từng employer).
 */
export class EmployerDashboardService {
  private readonly dashboardRepository: DashboardRepository;
  private readonly employerIdentityCache: EmployerIdentityCache;
  private readonly companyRepository: CompanyRepository;
  private readonly jobPostsService: JobPostsService;
  private readonly candidateOutreachService: CandidateOutreachService;
  private readonly messagingService: MessagingService;
  private readonly interviewsService: InterviewsService;

  constructor({
    dashboardRepository,
    employerIdentityCache,
    companyRepository,
    jobPostsService,
    candidateOutreachService,
    messagingService,
    interviewsService,
  }: {
    dashboardRepository: DashboardRepository;
    employerIdentityCache: EmployerIdentityCache;
    companyRepository: CompanyRepository;
    jobPostsService: JobPostsService;
    candidateOutreachService: CandidateOutreachService;
    messagingService: MessagingService;
    interviewsService: InterviewsService;
  }) {
    this.dashboardRepository = dashboardRepository;
    this.employerIdentityCache = employerIdentityCache;
    this.companyRepository = companyRepository;
    this.jobPostsService = jobPostsService;
    this.candidateOutreachService = candidateOutreachService;
    this.messagingService = messagingService;
    this.interviewsService = interviewsService;
  }

  async overview(userId: string): Promise<EmployerDashboardOverview> {
    const { employerId, companyId } = await this.requireEmployer(userId);
    // AD-19: id từ cache; company (tên, trạng thái xác minh, gói) vẫn đọc mới nhất.
    const company = await this.companyRepository.findById(companyId);
    if (!company) throw new AppError(404, "Employer profile not found");
    const [
      stats,
      attention,
      applications,
      unread,
      unreadCandidates,
      recentConversations,
      quota,
      upcomingInterviews,
      pastWeekInterviews,
      nextInterview,
    ] = await Promise.all([
      this.jobPostsService.ownStats(userId),
      // Cùng điều kiện với GET /employer/job-posts?attention=1 (định nghĩa ở job-posts).
      this.jobPostsService.attentionSummaryForCompany(companyId),
      this.dashboardRepository.applicationSummary(companyId),
      this.messagingService.getUnreadSummary(userId, "EMPLOYER"),
      this.dashboardRepository.countUnreadCandidates(employerId, userId),
      this.dashboardRepository.listUnreadConversations(employerId, userId, RECENT_CONVERSATION_LIMIT),
      this.candidateOutreachService.getDailyQuotaStatus({ companyId, company }),
      this.interviewsService.upcomingForCompany(companyId, 0),
      this.interviewsService.pastWeekCountForCompany(companyId),
      this.interviewsService.nextForCompany(companyId),
    ]);

    return {
      company: {
        id: company.id,
        name: company.name,
        verificationStatus: company.verificationStatus,
      },
      jobs: { ...stats, attention },
      applications: {
        newLast7Days: applications.newLast7Days,
        pendingCount: applications.pendingCount,
        oldestPendingSince: applications.oldestPendingSince?.toISOString() ?? null,
      },
      messages: {
        unreadConversations: unread.count,
        unreadCandidates,
        recent: recentConversations.map((conversation) => ({
          conversationId: conversation.conversationId,
          candidateName: conversation.candidateName,
          lastMessageAt: conversation.lastMessageAt.toISOString(),
        })),
      },
      outreach: { quota },
      interviews: {
        upcomingCount: upcomingInterviews.total,
        last7Days: pastWeekInterviews,
        next: nextInterview
          ? {
              interviewId: nextInterview.id,
              scheduledAt: nextInterview.scheduledAt,
              candidateName: nextInterview.candidateName,
              jobPostTitle: nextInterview.jobPostTitle,
            }
          : null,
      },
    };
  }

  async analytics(userId: string, range: DashboardRange): Promise<EmployerDashboardAnalytics> {
    const { companyId } = await this.requireEmployer(userId);
    const [applicationsDaily, viewsDaily] = await Promise.all([
      this.dashboardRepository.applicationsDaily(companyId, range),
      this.dashboardRepository.viewsDaily(companyId, range),
    ]);
    return { range, applicationsDaily, viewsDaily };
  }

  // AD-19: analytics chỉ cần companyId ⇒ không hỏi DB.
  private requireEmployer(userId: string) {
    return this.employerIdentityCache.require(userId);
  }
}
