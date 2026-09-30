import type { InterviewMode, PrismaClient } from "@prisma/client";
import type {
  AwaitingScheduleApplication,
  BatchScheduleFailureReason,
  CandidateInterview,
  EmployerInterview,
} from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { ApplicationsRepository } from "../applications/applications.repository";
import type { EmployerRepository, EmployerWithCompany } from "../employers/employer.repository";
import type { NotificationsService } from "../notifications/notifications.service";
import { toAwaitingScheduleApplication, toCandidateInterview, toEmployerInterview } from "./interview.mapper";
import type {
  BatchScheduleInterviewsDto,
  CancelInterviewDto,
  ListAwaitingScheduleQuery,
  ListEmployerInterviewsQuery,
  RescheduleInterviewDto,
  ScheduleInterviewDto,
} from "./interviews.dto";
import type { InterviewsRepository, InterviewUpdateData, InterviewWithRelations } from "./interviews.repository";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Việt Nam không có giờ mùa hè: lệch UTC cố định +7. */
const VN_OFFSET_MS = 7 * 60 * MINUTE_MS;
const MAX_DAYS_AHEAD = 180;
const DEFAULT_LIST_DAYS = 30;
const MAX_LIST_DAYS = 92;
const AWAITING_LIST_LIMIT = 100;
const CANDIDATE_LIST_LIMIT = 100;
/** Lô 20 hồ sơ ghi vài trăm câu lệnh (lịch, history, thông báo, outbox) — dư sức hơn mặc định 5 giây của Prisma. */
const BATCH_TRANSACTION_TIMEOUT_MS = 30_000;

/** Nửa đêm (giờ Việt Nam) của ngày chứa `date`, cộng thêm `days` ngày. */
export function vnDayStart(date: Date, days = 0): Date {
  const vnMidnight = Math.floor((date.getTime() + VN_OFFSET_MS) / DAY_MS) * DAY_MS;
  return new Date(vnMidnight - VN_OFFSET_MS + days * DAY_MS);
}

interface SlotRequest {
  applicationId: string;
  scheduledAt: Date;
}

interface CommonFields {
  durationMinutes: number;
  mode: InterviewMode;
  location: string;
  note: string | null;
}

type BookingResult =
  | { ok: true; interviews: InterviewWithRelations[] }
  | { ok: false; failures: Array<{ applicationId: string; reason: BatchScheduleFailureReason }> };

export type BatchScheduleResult =
  | { ok: true; items: EmployerInterview[] }
  | { ok: false; failures: Array<{ applicationId: string; reason: BatchScheduleFailureReason }> };

/**
 * Lịch phỏng vấn (AD-16 M2, D12). Thao tác theo phạm vi công ty: employer nào
 * của công ty cũng đặt/đổi/huỷ được lịch của hồ sơ thuộc tin của công ty.
 */
export class InterviewsService {
  private readonly prisma: PrismaClient;
  private readonly interviewsRepository: InterviewsRepository;
  private readonly applicationsRepository: ApplicationsRepository;
  private readonly employerRepository: EmployerRepository;
  private readonly notificationsService: NotificationsService;

  constructor({
    prisma,
    interviewsRepository,
    applicationsRepository,
    employerRepository,
    notificationsService,
  }: {
    prisma: PrismaClient;
    interviewsRepository: InterviewsRepository;
    applicationsRepository: ApplicationsRepository;
    employerRepository: EmployerRepository;
    notificationsService: NotificationsService;
  }) {
    this.prisma = prisma;
    this.interviewsRepository = interviewsRepository;
    this.applicationsRepository = applicationsRepository;
    this.employerRepository = employerRepository;
    this.notificationsService = notificationsService;
  }

  // ─── Employer: ghi ────────────────────────────────────────────────────────

  async schedule(userId: string, applicationId: string, dto: ScheduleInterviewDto): Promise<EmployerInterview> {
    const employer = await this.requireEmployer(userId);
    assertBookable(dto.scheduledAt);

    const result = await this.book(employer, [{ applicationId, scheduledAt: dto.scheduledAt }], commonFields(dto));
    if (!result.ok) {
      const reason = result.failures[0]?.reason;
      if (reason === "NOT_FOUND") throw new AppError(404, "Application not found");
      if (reason === "ALREADY_SCHEDULED") {
        throw new AppError(409, "This application already has an upcoming interview; reschedule it instead");
      }
      throw new AppError(400, "Only shortlisted or interviewing applications can be scheduled");
    }
    return toEmployerInterview(result.interviews[0]!);
  }

  /** D12 — tất cả hoặc không: có hồ sơ lỗi thì trả danh sách lỗi, không tạo lịch nào. */
  async scheduleBatch(userId: string, dto: BatchScheduleInterviewsDto): Promise<BatchScheduleResult> {
    const employer = await this.requireEmployer(userId);
    const step = dto.arrangement === "SEQUENTIAL" ? (dto.durationMinutes + dto.gapMinutes) * MINUTE_MS : 0;
    const slots = dto.applicationIds.map((applicationId, index) => ({
      applicationId,
      scheduledAt: new Date(dto.startAt.getTime() + index * step),
    }));
    assertBookable(slots[0]!.scheduledAt);
    assertBookable(slots[slots.length - 1]!.scheduledAt);

    const result = await this.book(employer, slots, commonFields(dto));
    if (!result.ok) return result;
    return { ok: true, items: result.interviews.map(toEmployerInterview) };
  }

  async reschedule(userId: string, interviewId: string, dto: RescheduleInterviewDto): Promise<EmployerInterview> {
    const employer = await this.requireEmployer(userId);
    const current = await this.requireUpcoming(interviewId, employer.companyId);
    if (dto.scheduledAt) assertBookable(dto.scheduledAt);
    // Đổi hình thức mà giữ liên kết/địa chỉ cũ gần như luôn là nhầm (link họp thành địa chỉ văn phòng).
    if (dto.mode && dto.mode !== current.mode && dto.location === undefined) {
      throw new AppError(400, "A new location is required when changing the interview mode");
    }

    const changes = diff(current, dto);
    if (Object.keys(changes).length === 0) return toEmployerInterview(current);

    const updated = await this.prisma.$transaction(async (tx) => {
      const count = await this.interviewsRepository.updateIfUpcoming(interviewId, changes, tx);
      if (count === 0) throw new AppError(409, "This interview can no longer be changed");
      const interview = (await this.interviewsRepository.findById(interviewId, tx))!;
      await this.notificationsService.notify(
        "INTERVIEW_RESCHEDULED",
        interview.application.candidate.userId,
        { ...interviewDetails(interview), previousScheduledAt: current.scheduledAt },
        tx,
      );
      return interview;
    });
    return toEmployerInterview(updated);
  }

  async cancel(userId: string, interviewId: string, dto: CancelInterviewDto): Promise<EmployerInterview> {
    const employer = await this.requireEmployer(userId);
    const current = await this.requireUpcoming(interviewId, employer.companyId);

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const count = await this.interviewsRepository.cancelIfUpcoming(interviewId, dto.reason, tx);
      if (count === 0) throw new AppError(409, "This interview can no longer be cancelled");
      await this.notificationsService.notify(
        "INTERVIEW_CANCELLED",
        current.application.candidate.userId,
        {
          interviewId: current.id,
          applicationId: current.applicationId,
          jobPostTitle: current.application.jobPost.title,
          companyName: current.application.jobPost.company.name,
          scheduledAt: current.scheduledAt,
          reason: dto.reason,
        },
        tx,
      );
      return (await this.interviewsRepository.findById(interviewId, tx))!;
    });
    return toEmployerInterview(cancelled);
  }

  // ─── Employer: đọc ────────────────────────────────────────────────────────

  async listForEmployer(userId: string, query: ListEmployerInterviewsQuery): Promise<EmployerInterview[]> {
    const employer = await this.requireEmployer(userId);
    const from = query.from ?? vnDayStart(new Date());
    const to = query.to ?? new Date(from.getTime() + DEFAULT_LIST_DAYS * DAY_MS);
    if (to <= from) throw new AppError(400, "`to` must be after `from`");
    if (to.getTime() - from.getTime() > MAX_LIST_DAYS * DAY_MS) {
      throw new AppError(400, `The range cannot exceed ${MAX_LIST_DAYS} days`);
    }
    const interviews = await this.interviewsRepository.listForCompany(employer.companyId, {
      from,
      to,
      includeCancelled: query.includeCancelled,
    });
    return interviews.map(toEmployerInterview);
  }

  async listAwaiting(userId: string, query: ListAwaitingScheduleQuery): Promise<AwaitingScheduleApplication[]> {
    const employer = await this.requireEmployer(userId);
    const page = await this.interviewsRepository.listAwaitingSchedule(employer.companyId, {
      jobPostId: query.jobPostId,
      limit: AWAITING_LIST_LIMIT,
    });
    return page.items.map(toAwaitingScheduleApplication);
  }

  // ─── Dùng bởi dashboard (AD-16: dashboard gọi service của module chủ) ──────

  async awaitingForCompany(companyId: string, limit: number): Promise<{ total: number; items: AwaitingScheduleApplication[] }> {
    const page = await this.interviewsRepository.listAwaitingSchedule(companyId, { limit });
    return { total: page.total, items: page.items.map(toAwaitingScheduleApplication) };
  }

  /** Lịch chưa diễn ra trong 7 ngày tới (tới hết ngày thứ 7 kể cả hôm nay, giờ Việt Nam). */
  async upcomingForCompany(companyId: string, limit: number): Promise<{ total: number; items: EmployerInterview[] }> {
    const page = await this.interviewsRepository.listUpcomingForCompany(companyId, vnDayStart(new Date(), 7), limit);
    return { total: page.total, items: page.items.map(toEmployerInterview) };
  }

  /** Buổi chưa diễn ra gần nhất, không giới hạn khoảng thời gian. */
  async nextForCompany(companyId: string): Promise<EmployerInterview | null> {
    const page = await this.interviewsRepository.listUpcomingForCompany(companyId, null, 1);
    const next = page.items[0];
    return next ? toEmployerInterview(next) : null;
  }

  // ─── Candidate ────────────────────────────────────────────────────────────

  async listForCandidate(userId: string): Promise<CandidateInterview[]> {
    const candidate = await this.prisma.candidate.findUnique({ where: { userId }, select: { id: true } });
    if (!candidate) return [];
    const interviews = await this.interviewsRepository.listForCandidate(candidate.id, CANDIDATE_LIST_LIMIT);
    return interviews.map(toCandidateInterview);
  }

  // ─── Nội bộ ───────────────────────────────────────────────────────────────

  /**
   * Đặt lịch cho một hoặc nhiều hồ sơ trong MỘT transaction: khoá dòng hồ sơ,
   * kiểm tra hết rồi mới ghi. Có hồ sơ lỗi thì trả lỗi và không ghi gì.
   * Hồ sơ SHORTLISTED chuyển sang INTERVIEWING (ghi history); ứng viên chỉ nhận
   * INTERVIEW_SCHEDULED, không kèm APPLICATION_STATUS_CHANGED (một việc, một email).
   */
  private book(employer: EmployerWithCompany, slots: SlotRequest[], common: CommonFields): Promise<BookingResult> {
    const ids = slots.map((slot) => slot.applicationId);
    return this.prisma.$transaction(
      async (tx): Promise<BookingResult> => {
        await this.interviewsRepository.lockApplications(ids, tx);
        const applications = await this.interviewsRepository.findSchedulableApplications(ids, employer.companyId, tx);
        const byId = new Map(applications.map((application) => [application.id, application]));

        const failures: Array<{ applicationId: string; reason: BatchScheduleFailureReason }> = [];
        for (const id of ids) {
          const application = byId.get(id);
          if (!application) failures.push({ applicationId: id, reason: "NOT_FOUND" });
          else if (application.status !== "SHORTLISTED" && application.status !== "INTERVIEWING") {
            failures.push({ applicationId: id, reason: "INVALID_STATUS" });
          } else if (application.hasUpcomingInterview) {
            failures.push({ applicationId: id, reason: "ALREADY_SCHEDULED" });
          }
        }
        if (failures.length > 0) return { ok: false, failures };

        const interviews: InterviewWithRelations[] = [];
        for (const slot of slots) {
          const application = byId.get(slot.applicationId)!;
          if (application.status === "SHORTLISTED") {
            await this.applicationsRepository.update(application.id, { status: "INTERVIEWING" }, tx);
            await this.applicationsRepository.createStatusHistory(
              { applicationId: application.id, fromStatus: "SHORTLISTED", toStatus: "INTERVIEWING", actorId: employer.userId },
              tx,
            );
          }
          const interview = await this.interviewsRepository.create(
            { applicationId: application.id, scheduledAt: slot.scheduledAt, ...common, createdById: employer.userId },
            tx,
          );
          await this.notificationsService.notify("INTERVIEW_SCHEDULED", application.candidateUserId, interviewDetails(interview), tx);
          interviews.push(interview);
        }
        return { ok: true, interviews };
      },
      { timeout: BATCH_TRANSACTION_TIMEOUT_MS },
    );
  }

  private async requireUpcoming(interviewId: string, companyId: string): Promise<InterviewWithRelations> {
    const interview = await this.interviewsRepository.findByIdForCompany(interviewId, companyId);
    if (!interview) throw new AppError(404, "Interview not found");
    if (interview.status !== "SCHEDULED") throw new AppError(400, "This interview has been cancelled");
    if (interview.scheduledAt.getTime() <= Date.now()) throw new AppError(400, "This interview has already taken place");
    if (interview.application.status !== "INTERVIEWING") {
      throw new AppError(400, "The application is no longer in the interviewing stage");
    }
    return interview;
  }

  private async requireEmployer(userId: string): Promise<EmployerWithCompany> {
    const employer = await this.employerRepository.findByUserId(userId);
    if (!employer) throw new AppError(404, "Employer profile not found");
    return employer;
  }
}

function assertBookable(scheduledAt: Date): void {
  const now = Date.now();
  if (scheduledAt.getTime() <= now) throw new AppError(400, "The interview time must be in the future");
  if (scheduledAt.getTime() > now + MAX_DAYS_AHEAD * DAY_MS) {
    throw new AppError(400, `The interview time cannot be more than ${MAX_DAYS_AHEAD} days ahead`);
  }
}

function commonFields(dto: { durationMinutes: number; mode: InterviewMode; location: string; note?: string | null | undefined }): CommonFields {
  return { durationMinutes: dto.durationMinutes, mode: dto.mode, location: dto.location, note: dto.note ?? null };
}

/** Chỉ giữ các trường thực sự khác giá trị hiện tại. */
function diff(current: InterviewWithRelations, dto: RescheduleInterviewDto): InterviewUpdateData {
  const changes: InterviewUpdateData = {};
  if (dto.scheduledAt && dto.scheduledAt.getTime() !== current.scheduledAt.getTime()) changes.scheduledAt = dto.scheduledAt;
  if (dto.durationMinutes !== undefined && dto.durationMinutes !== current.durationMinutes) {
    changes.durationMinutes = dto.durationMinutes;
  }
  if (dto.mode && dto.mode !== current.mode) changes.mode = dto.mode;
  if (dto.location !== undefined && dto.location !== current.location) changes.location = dto.location;
  if (dto.note !== undefined && dto.note !== current.note) changes.note = dto.note;
  return changes;
}

/** Payload chung của INTERVIEW_SCHEDULED/RESCHEDULED/REMINDER. */
export function interviewDetails(interview: InterviewWithRelations) {
  return {
    interviewId: interview.id,
    applicationId: interview.applicationId,
    jobPostTitle: interview.application.jobPost.title,
    companyName: interview.application.jobPost.company.name,
    scheduledAt: interview.scheduledAt,
    durationMinutes: interview.durationMinutes,
    mode: interview.mode,
    location: interview.location,
    note: interview.note,
  };
}
