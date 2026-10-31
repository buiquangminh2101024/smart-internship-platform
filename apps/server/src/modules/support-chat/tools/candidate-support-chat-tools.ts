import type { ApplicationStatus, InterviewMode, InterviewStatus } from "@prisma/client";
import { z } from "zod";
import type { ApplicationsService } from "../../applications/applications.service";
import { COMPLETENESS_WEIGHTS } from "../../candidate-insights/candidate-insights.config";
import type { CandidateInsightsRepository } from "../../candidate-insights/candidate-insights.repository";
import { computeCompletenessScore } from "../../candidate-insights/profile-suggestions.util";
import type { InterviewsService } from "../../interviews/interviews.service";
import type { CandidateMatchProfileLoader } from "../../job-matching/candidate-match-profile.loader";
import { defineSupportChatTool, type SupportChatTool } from "./support-chat-tool";
import { APPLICATION_STATUS_LABEL, DATE_FORMAT, DATE_TIME_FORMAT, excerpt, LIST_LIMIT } from "./support-chat-tool-format";

// 3 tool Candidate của GĐ2 (docs/06-backend/support-chatbot/PLAN.md mục "GĐ2 — Tool chỉ đọc").
// Mỗi tool bọc một hàm đọc sẵn có, chỉ trả các trường cần để trả lời (không SĐT, email, nội
// dung CV, ghi chú của nhà tuyển dụng). Nhãn trạng thái khớp FAQ `application-status`.

const APPLICATIONS_PAGE = "/applications";
const PROFILE_PAGE = "/profile";

const APPLICATION_STATUSES = Object.keys(APPLICATION_STATUS_LABEL) as [ApplicationStatus, ...ApplicationStatus[]];

const INTERVIEW_MODE_LABEL: Record<InterviewMode, string> = { ONLINE: "Trực tuyến", ONSITE: "Trực tiếp" };
const INTERVIEW_STATUS_LABEL: Record<InterviewStatus, string> = { SCHEDULED: "Đã lên lịch", CANCELLED: "Đã huỷ" };

const COMPLETENESS_LABEL: Record<keyof typeof COMPLETENESS_WEIGHTS, string> = {
  hasSkills: "Kỹ năng",
  hasWorkExperience: "Kinh nghiệm làm việc",
  hasEducation: "Học vấn",
  hasHeadlineOrBio: "Tiêu đề hoặc phần giới thiệu bản thân",
};

export function candidateSupportChatTools({
  applicationsService,
  interviewsService,
  candidateInsightsRepository,
  candidateMatchProfileLoader,
}: {
  applicationsService: ApplicationsService;
  interviewsService: InterviewsService;
  candidateInsightsRepository: CandidateInsightsRepository;
  candidateMatchProfileLoader: CandidateMatchProfileLoader;
}): SupportChatTool[] {
  return [
    defineSupportChatTool({
      name: "getMyApplications",
      description:
        "Đơn ứng tuyển của người đang hỏi: số đơn theo từng trạng thái và tối đa 10 đơn mới nhất (tên tin, công ty, trạng thái, ngày nộp). Dùng khi họ hỏi về đơn đã nộp, trạng thái đơn, đơn được nhận hay bị từ chối.",
      args: z.strictObject({
        status: z
          .enum(APPLICATION_STATUSES)
          .optional()
          .describe(
            `Chỉ lấy đơn ở một trạng thái: ${APPLICATION_STATUSES.map((status) => `${status} = ${APPLICATION_STATUS_LABEL[status]}`).join(", ")}. Bỏ trống ⇒ mọi trạng thái.`,
          ),
      }),
      run: async (userId, { status }) => {
        // Cùng hàm trang /applications dùng, đã lọc theo ứng viên của userId, mới nhất trước.
        const applications = await applicationsService.listCandidateApplications(userId);
        const countByStatus: Record<string, number> = {};
        for (const application of applications) {
          const label = APPLICATION_STATUS_LABEL[application.status];
          countByStatus[label] = (countByStatus[label] ?? 0) + 1;
        }
        const matched = status ? applications.filter((application) => application.status === status) : applications;
        return {
          total: applications.length,
          countByStatus,
          matched: matched.length,
          items: matched.slice(0, LIST_LIMIT).map((application) => ({
            jobTitle: excerpt(application.jobPost.title),
            company: excerpt(application.jobPost.company.name),
            status: APPLICATION_STATUS_LABEL[application.status],
            appliedOn: DATE_FORMAT.format(application.reappliedAt ?? application.createdAt),
          })),
          viewAllAt: APPLICATIONS_PAGE,
        };
      },
    }),

    defineSupportChatTool({
      name: "getMyInterviews",
      description:
        "Lịch phỏng vấn của người đang hỏi (tối đa 10): tin, công ty, thời gian (giờ Việt Nam), thời lượng, hình thức, địa điểm hoặc link, trạng thái. Dùng khi họ hỏi có lịch phỏng vấn không, phỏng vấn khi nào, ở đâu.",
      args: z.strictObject({
        upcomingOnly: z
          .boolean()
          .optional()
          .describe("true hoặc bỏ trống: chỉ lịch sắp tới chưa huỷ (sớm nhất trước). false: mọi lịch kể cả đã qua và đã huỷ (gần nhất trước)."),
      }),
      run: async (userId, { upcomingOnly = true }) => {
        // Đã lọc theo ứng viên của userId, sắp theo thời gian tăng dần.
        const interviews = await interviewsService.listForCandidate(userId);
        const now = Date.now();
        const endsAt = (interview: (typeof interviews)[number]) =>
          new Date(interview.scheduledAt).getTime() + interview.durationMinutes * 60_000;
        // Buổi đang diễn ra vẫn tính là sắp tới.
        const upcoming = interviews.filter((interview) => interview.status === "SCHEDULED" && endsAt(interview) > now);
        const selected = upcomingOnly ? upcoming : [...interviews].reverse();
        return {
          total: interviews.length,
          upcomingCount: upcoming.length,
          items: selected.slice(0, LIST_LIMIT).map((interview) => ({
            jobTitle: excerpt(interview.jobPostTitle),
            company: excerpt(interview.companyName),
            time: DATE_TIME_FORMAT.format(new Date(interview.scheduledAt)),
            durationMinutes: interview.durationMinutes,
            mode: INTERVIEW_MODE_LABEL[interview.mode],
            ...(interview.location ? { location: excerpt(interview.location) } : {}),
            status: INTERVIEW_STATUS_LABEL[interview.status],
            ...(interview.cancelReason ? { cancelReason: excerpt(interview.cancelReason) } : {}),
            isPast: endsAt(interview) <= now,
          })),
          viewAllAt: APPLICATIONS_PAGE,
        };
      },
    }),

    defineSupportChatTool({
      name: "getMyProfileCompleteness",
      description:
        "Độ hoàn thiện hồ sơ ứng viên của người đang hỏi (điểm 0–100) và các mục còn thiếu kèm số điểm mỗi mục. Dùng khi họ hỏi hồ sơ đã đủ chưa, cần bổ sung gì.",
      args: z.strictObject({}),
      run: async (userId) => {
        const candidateId = await candidateInsightsRepository.findCandidateIdByUserId(userId);
        const profile = candidateId ? await candidateMatchProfileLoader.load(candidateId) : null;
        if (!profile) return { error: "Chưa có hồ sơ ứng viên.", editAt: PROFILE_PAGE };
        // D10 của candidate-insights: cùng công thức "Độ hoàn thiện hồ sơ" ở mục Phân tích hồ sơ.
        const keys = Object.keys(COMPLETENESS_WEIGHTS) as Array<keyof typeof COMPLETENESS_WEIGHTS>;
        return {
          score: computeCompletenessScore(profile.completeness),
          maxScore: 100,
          done: keys.filter((key) => profile.completeness[key]).map((key) => COMPLETENESS_LABEL[key]),
          missing: keys
            .filter((key) => !profile.completeness[key])
            .map((key) => ({ item: COMPLETENESS_LABEL[key], points: COMPLETENESS_WEIGHTS[key] })),
          editAt: PROFILE_PAGE,
        };
      },
    }),
  ];
}
