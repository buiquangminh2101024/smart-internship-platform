import type { JobPostStatus, SubscriptionStatus } from "@prisma/client";
import type { SubscriptionAccessStatus } from "@sip/shared-types";
import { z } from "zod";
import { AppError } from "../../../shared/errors/AppError";
import type { ApplicationsService } from "../../applications/applications.service";
import type { JobPostsService } from "../../job-posts/job-posts.service";
import type { SubscriptionsService } from "../../subscriptions/subscriptions.service";
import { defineSupportChatTool, type SupportChatTool } from "./support-chat-tool";
import { APPLICATION_STATUS_LABEL, DATE_FORMAT, excerpt, LIST_LIMIT } from "./support-chat-tool-format";

// 3 tool Employer của GĐ2 (docs/06-backend/support-chatbot/PLAN.md mục "GĐ2 — Tool chỉ đọc",
// đợt F). Mỗi tool bọc hàm đọc của trang tương ứng, đã lọc theo công ty của userId. Không trả
// tên, email, SĐT ứng viên, ghi chú/đánh giá nội bộ, giá tiền hay mã đơn hàng.

const JOBS_PAGE = "/employer/jobs";
const APPLICATIONS_PAGE = "/employer/applications";
const SUBSCRIPTION_PAGE = "/employer/subscription";
const ONBOARDING_PAGE = "/employer/hoan-tat-thu-tuc";

/** Nhãn khớp FAQ `jobpost-status` (và JOB_STATUS_LABEL ở web). */
const JOB_POST_STATUS_LABEL: Record<JobPostStatus, string> = {
  DRAFT: "Nháp",
  PENDING: "Chờ duyệt",
  PUBLISHED: "Đang hiển thị",
  CLOSED: "Đã đóng",
  EXPIRED: "Hết hạn",
  TAKEN_DOWN: "Đã hạ",
};
const JOB_POST_STATUSES = Object.keys(JOB_POST_STATUS_LABEL) as [JobPostStatus, ...JobPostStatus[]];

/** Nhãn khớp FAQ `subscription-payment`. */
const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  PENDING: "Đang chờ thanh toán",
  ACTIVE: "Đang hoạt động",
  EXPIRED: "Đã hết hạn",
  CANCELLED: "Đã huỷ",
};

/**
 * Tài khoản Employer chưa gắn công ty (chưa xong "Hoàn tất thủ tục") ⇒ hàm đọc ném 404. Đổi
 * thành `{ error }` có trang cần đến, thay vì để registry ghi log như lỗi DB.
 */
async function withEmployer(run: () => Promise<Record<string, unknown>>): Promise<Record<string, unknown>> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 404) {
      return { error: "Tài khoản chưa gắn với công ty nào.", setupAt: ONBOARDING_PAGE };
    }
    throw error;
  }
}

/** Gói hoặc dùng thử, viết lại bằng nhãn tiếng Việt và ngày giờ Việt Nam. */
function describeAccess(access: SubscriptionAccessStatus): Record<string, unknown> {
  const subscription = access.subscription
    ? {
        planName: excerpt(access.subscription.plan.name),
        jobPostQuota: access.subscription.plan.jobPostQuota,
        status: SUBSCRIPTION_STATUS_LABEL[access.subscription.status],
        startedOn: DATE_FORMAT.format(new Date(access.subscription.startDate)),
        endsOn: DATE_FORMAT.format(new Date(access.subscription.endDate)),
      }
    : undefined;
  const trialEndsOn = access.trialEndsAt ? DATE_FORMAT.format(new Date(access.trialEndsAt)) : undefined;

  if (access.mode === "SUBSCRIBED") {
    // Hạn mức gói tính theo số tin tạo mới, kể cả nháp (FAQ `subscription-plans`).
    return { mode: "Đang có gói", subscription, newJobPostsRemaining: access.publishRemaining };
  }
  if (access.mode === "TRIAL") {
    return {
      mode: "Đang dùng thử",
      publishRemaining: access.publishRemaining,
      draftRemaining: access.draftRemaining,
      trialEndsOn,
    };
  }
  // BLOCKED: phân biệt lý do theo các trường SubscriptionsService gửi kèm.
  const reason = subscription
    ? "Không còn gói hiệu lực (đã từng mua gói nên không quay lại dùng thử)."
    : access.publishRemaining !== undefined
      ? "Đã dùng hết lượt đăng tin hoặc lượt tin nháp của dùng thử."
      : trialEndsOn
        ? "Đã hết 30 ngày dùng thử."
        : "Công ty chưa được xác thực nên chưa bắt đầu dùng thử.";
  return { mode: "Không đăng tin mới được", reason, latestSubscription: subscription, trialEndsOn };
}

export function employerSupportChatTools({
  jobPostsService,
  applicationsService,
  subscriptionsService,
}: {
  jobPostsService: JobPostsService;
  applicationsService: ApplicationsService;
  subscriptionsService: SubscriptionsService;
}): SupportChatTool[] {
  return [
    defineSupportChatTool({
      name: "getMyJobPosts",
      description:
        "Tin tuyển dụng của công ty người đang hỏi: số tin theo trạng thái và tối đa 10 tin mới tạo gần nhất (tiêu đề, trạng thái, ngày hết hạn, số hồ sơ, lý do bị từ chối/bị hạ nếu có). Dùng khi họ hỏi về tin đã đăng, tin đang hiển thị, tin chờ duyệt, tin bị từ chối hay hết hạn.",
      args: z.strictObject({
        status: z
          .enum(JOB_POST_STATUSES)
          .optional()
          .describe(
            `Chỉ lấy tin ở một trạng thái: ${JOB_POST_STATUSES.map((status) => `${status} = ${JOB_POST_STATUS_LABEL[status]}`).join(", ")}. Bỏ trống ⇒ mọi trạng thái.`,
          ),
      }),
      run: (userId, { status }) =>
        withEmployer(async () => {
          // Cùng hàm trang /employer/jobs dùng (trang đầu, mới tạo trước) và số đếm trên tab.
          const [page, stats] = await Promise.all([
            jobPostsService.listOwn(userId, status ? { status } : {}),
            jobPostsService.ownStats(userId),
          ]);
          return {
            countByStatus: {
              [JOB_POST_STATUS_LABEL.PUBLISHED]: stats.published,
              [JOB_POST_STATUS_LABEL.PENDING]: stats.pending,
              [JOB_POST_STATUS_LABEL.DRAFT]: stats.draft,
              "Đã đóng, hết hạn hoặc đã hạ": stats.closed,
            },
            items: page.items.slice(0, LIST_LIMIT).map((jobPost) => {
              // Admin từ chối ⇒ tin về Nháp; Admin gỡ ⇒ Đã hạ. Lý do do Admin nhập.
              const moderation = jobPost.latestModerationAction;
              const adminReason =
                moderation?.reason && (moderation.action === "REJECTED" || moderation.action === "RETRACTED")
                  ? excerpt(moderation.reason)
                  : undefined;
              return {
                title: excerpt(jobPost.title),
                status: JOB_POST_STATUS_LABEL[jobPost.status],
                ...(jobPost.expiresAt ? { expiresOn: DATE_FORMAT.format(new Date(jobPost.expiresAt)) } : {}),
                applicationCount: jobPost.applicationCount,
                ...(adminReason ? { adminReason } : {}),
              };
            }),
            hasMore: page.hasMore || page.items.length > LIST_LIMIT,
            viewAllAt: JOBS_PAGE,
          };
        }),
    }),

    defineSupportChatTool({
      name: "getApplicationsSummary",
      description:
        "Hồ sơ ứng tuyển trên các tin ĐANG HIỂN THỊ của công ty người đang hỏi: số hồ sơ theo từng trạng thái và số hồ sơ của từng tin (tối đa 10 tin nhiều hồ sơ nhất). Không có tên hay thông tin liên hệ ứng viên. Dùng khi họ hỏi có bao nhiêu hồ sơ, bao nhiêu hồ sơ chờ duyệt, tin nào nhiều hồ sơ.",
      args: z.strictObject({}),
      run: (userId) =>
        withEmployer(async () => {
          const { statusCounts, openJobs } = await applicationsService.summarizeOpenJobApplications(userId);
          const countByStatus = Object.fromEntries(
            Object.entries(statusCounts).map(([status, count]) => [
              APPLICATION_STATUS_LABEL[status as keyof typeof APPLICATION_STATUS_LABEL],
              count,
            ]),
          );
          const byCount = [...openJobs].sort((a, b) => b.count - a.count);
          return {
            total: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
            countByStatus,
            openJobsWithApplications: byCount.length,
            jobs: byCount
              .slice(0, LIST_LIMIT)
              .map((job) => ({ title: excerpt(job.title), applicationCount: job.count })),
            note: "Chỉ tính tin Đang hiển thị; số hồ sơ của từng tin gồm cả hồ sơ ứng viên đã huỷ.",
            viewAllAt: APPLICATIONS_PAGE,
          };
        }),
    }),

    defineSupportChatTool({
      name: "getMySubscription",
      description:
        "Gói dịch vụ hoặc dùng thử hiện tại của công ty người đang hỏi: tên gói, ngày hết hạn, số tin còn tạo/đăng được; nếu không đăng tin được thì kèm lý do. Dùng khi họ hỏi còn bao nhiêu lượt đăng tin, gói khi nào hết hạn, còn dùng thử không.",
      args: z.strictObject({}),
      run: (userId) =>
        withEmployer(async () => ({
          ...describeAccess(await subscriptionsService.getCompanySubscriptionAccessForUser(userId)),
          viewAt: SUBSCRIPTION_PAGE,
        })),
    }),
  ];
}
