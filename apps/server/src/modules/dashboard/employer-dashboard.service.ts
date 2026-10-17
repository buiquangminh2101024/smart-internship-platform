import type {
  DashboardAttentionJob,
  DashboardRange,
  EmployerDashboardAnalytics,
  EmployerDashboardOverview,
  EmployerDashboardTasks,
} from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { CandidateOutreachService } from "../candidate-outreach/candidate-outreach.service";
import type { CompanyRepository } from "../companies/company.repository";
import type { EmployerIdentityCache } from "../employers/employer-identity-cache";
import type { InterviewsService } from "../interviews/interviews.service";
import type { JobPostsService } from "../job-posts/job-posts.service";
import type { MessagingService } from "../messaging/messaging.service";
import type { DashboardRepository } from "./dashboard.repository";

/** Mỗi nhóm "việc cần làm" hiện tối đa bấy nhiêu mục, còn lại là "Xem tất cả". */
const TASK_LIMIT = 5;
const RECENT_CONVERSATION_LIMIT = 3;
/** "Tin sắp hết hạn" trên dashboard (khác cửa sổ 3 ngày của thông báo JOB_POST_EXPIRING). */
const EXPIRING_WINDOW_DAYS = 7;

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
      expiringCount,
      topJob,
      applications,
      unread,
      unreadCandidates,
      recentConversations,
      quota,
      outreach,
      interviewsDaily,
      upcomingInterviews,
      nextInterview,
    ] = await Promise.all([
      this.jobPostsService.ownStats(userId),
      this.dashboardRepository.countExpiringJobs(companyId, EXPIRING_WINDOW_DAYS),
      this.dashboardRepository.findTopPublishedJob(companyId),
      this.dashboardRepository.applicationSummary(companyId),
      this.messagingService.getUnreadSummary(userId, "EMPLOYER"),
      this.dashboardRepository.countUnreadCandidates(employerId, userId),
      this.dashboardRepository.listUnreadConversations(employerId, userId, RECENT_CONVERSATION_LIMIT),
      this.candidateOutreachService.getDailyQuotaStatus({ companyId, company }),
      this.dashboardRepository.outreachLast30Days(companyId),
      this.dashboardRepository.interviewsNext7Days(companyId),
      this.interviewsService.upcomingForCompany(companyId, 0),
      this.interviewsService.nextForCompany(companyId),
    ]);

    return {
      company: {
        id: company.id,
        name: company.name,
        verificationStatus: company.verificationStatus,
      },
      jobs: { ...stats, expiringIn7Days: expiringCount, topJob },
      applications: {
        newLast7Days: applications.newLast7Days,
        pendingCount: applications.pendingCount,
        pendingWait: applications.pendingWait,
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
      outreach: { quota, last30Days: outreach },
      interviews: {
        next7Days: interviewsDaily,
        upcomingCount: upcomingInterviews.total,
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

  async tasks(userId: string): Promise<EmployerDashboardTasks> {
    const { companyId } = await this.requireEmployer(userId);
    const [summary, pending, expiring, rejected, awaitingSchedule, upcomingInterviews] = await Promise.all([
      this.dashboardRepository.applicationSummary(companyId),
      this.dashboardRepository.listPendingApplications(companyId, TASK_LIMIT),
      this.dashboardRepository.listExpiringJobs(companyId, EXPIRING_WINDOW_DAYS, TASK_LIMIT),
      this.dashboardRepository.listRejectedJobs(companyId, TASK_LIMIT),
      this.interviewsService.awaitingForCompany(companyId, TASK_LIMIT),
      this.interviewsService.upcomingForCompany(companyId, TASK_LIMIT),
    ]);

    const attention: DashboardAttentionJob[] = [
      ...expiring.items.map((job): DashboardAttentionJob => ({
        jobPostId: job.jobPostId,
        title: job.title,
        kind: "EXPIRING",
        expiresAt: job.expiresAt.toISOString(),
        rejectedReason: null,
        rejectedAt: null,
        applicationCount: job.applicationCount,
      })),
      ...rejected.items.map((job): DashboardAttentionJob => ({
        jobPostId: job.jobPostId,
        title: job.title,
        kind: "REJECTED",
        expiresAt: null,
        rejectedReason: job.rejectedReason,
        rejectedAt: job.rejectedAt.toISOString(),
        applicationCount: job.applicationCount,
      })),
    ];

    return {
      pendingApplications: {
        total: summary.pendingCount,
        wait: summary.pendingWait,
        items: pending.map((application) => ({
          applicationId: application.applicationId,
          candidateName: application.candidateName,
          candidateAvatarUrl: application.candidateAvatarUrl,
          universityName: application.universityName,
          jobPostId: application.jobPostId,
          jobPostTitle: application.jobPostTitle,
          waitingSince: application.waitingSince.toISOString(),
        })),
      },
      attentionJobs: { total: expiring.total + rejected.total, items: attention.slice(0, TASK_LIMIT) },
      awaitingSchedule,
      upcomingInterviews,
    };
  }

  async analytics(userId: string, range: DashboardRange): Promise<EmployerDashboardAnalytics> {
    const { companyId } = await this.requireEmployer(userId);
    const [applicationsDaily, viewsDaily, funnel, firstResponse] = await Promise.all([
      this.dashboardRepository.applicationsDaily(companyId, range),
      this.dashboardRepository.viewsDaily(companyId, range),
      this.dashboardRepository.funnel(companyId, range),
      this.dashboardRepository.firstResponse(companyId, range),
    ]);
    return { range, applicationsDaily, viewsDaily, funnel, firstResponse };
  }

  // AD-19: tasks/analytics chỉ cần companyId ⇒ không hỏi DB.
  private requireEmployer(userId: string) {
    return this.employerIdentityCache.require(userId);
  }
}
