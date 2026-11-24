import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import { submitApplicationInTx } from "../applications/application-submit";
import type { ApplicationsRepository } from "../applications/applications.repository";
import type { MessagingService } from "../messaging/messaging.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { CandidateOutreachRepository, InvitationWithRelations } from "./candidate-outreach.repository";

const INVITATION_NO_LONGER_VALID = "Lời mời không còn hiệu lực.";

export interface AcceptApplicationInput {
  cvId: string;
  coverLetter?: string | null | undefined;
}

export interface AcceptResult {
  applicationId: string;
  /** true ⇒ ứng viên đã có đơn: chỉ gắn lời mời, trạng thái đơn không đổi (Q4). */
  linkedExisting: boolean;
}

/**
 * Nhận lời mời = ứng tuyển vào tin (AD-28, docs/06-backend/invitation-apply/PLAN.md).
 * Dùng chung cho `CandidateOutreachService.respond` (bấm "Nhận lời & ứng tuyển"),
 * `ApplicationsService.createApplication` (nộp đơn thường khi có lời mời đang chờ, Q4)
 * và endpoint ứng tuyển từ lời mời đã nhận theo kiểu cũ. Không phụ thuộc hai service kia
 * nên không tạo vòng DI.
 */
export class InvitationApplicationService {
  private readonly prisma: PrismaClient;
  private readonly applicationsRepository: ApplicationsRepository;
  private readonly repository: CandidateOutreachRepository;
  private readonly notificationsService: NotificationsService;
  private readonly messagingService: MessagingService;
  private readonly logger: Logger;

  constructor({
    prisma,
    applicationsRepository,
    candidateOutreachRepository,
    notificationsService,
    messagingService,
    logger,
  }: {
    prisma: PrismaClient;
    applicationsRepository: ApplicationsRepository;
    candidateOutreachRepository: CandidateOutreachRepository;
    notificationsService: NotificationsService;
    messagingService: MessagingService;
    logger: Logger;
  }) {
    this.prisma = prisma;
    this.applicationsRepository = applicationsRepository;
    this.repository = candidateOutreachRepository;
    this.notificationsService = notificationsService;
    this.messagingService = messagingService;
    this.logger = logger;
  }

  /** Lời mời PENDING còn hiệu lực của cặp tin–ứng viên — nộp đơn thường dùng để đổi luồng (Q4). */
  findOpenPendingForJob(candidateId: string, jobPostId: string, tx: Prisma.TransactionClient) {
    return this.repository.findOpenPendingForJob(candidateId, jobPostId, tx);
  }

  /**
   * Trong transaction của người gọi: kiểm lại tin, lời mời PENDING → ACCEPTED, rồi tạo
   * đơn REVIEWING gắn lời mời (hoặc gắn lời mời vào đơn có sẵn). Lỗi bất kỳ ⇒ người gọi
   * rollback cả lời mời lẫn đơn.
   */
  async acceptInTx(
    tx: Prisma.TransactionClient,
    invitation: InvitationWithRelations,
    actorUserId: string,
    input: AcceptApplicationInput,
  ): Promise<AcceptResult> {
    const job = await this.requireOpenJob(tx, invitation.jobPostId);
    // Điều kiện PENDING + chưa quá hạn nằm trong câu UPDATE ⇒ an toàn khi trả lời đồng thời.
    const updated = await this.repository.respondIfPending(invitation.id, "ACCEPTED", tx);
    if (!updated) throw new AppError(409, INVITATION_NO_LONGER_VALID);

    const existing = await this.applicationsRepository.findByJobAndCandidate(invitation.jobPostId, invitation.candidateId, tx);
    if (existing && existing.status !== "CANCELLED") {
      // Q4 — đã có đơn: không tạo đơn mới, không kéo lùi trạng thái; nhà tuyển dụng đã có
      // đơn nên chỉ báo người mời như trước AD-28.
      await this.repository.linkInvitationIfUnlinked(existing.id, invitation.id, tx);
      await this.notificationsService.notify(
        "CANDIDATE_OUTREACH_INVITATION_RESPONDED",
        invitation.employer.userId,
        {
          invitationId: invitation.id,
          jobPostId: invitation.jobPostId,
          jobPostTitle: job.title,
          candidateName: invitation.candidate.fullName,
          accepted: true,
        },
        tx,
      );
      return { applicationId: existing.id, linkedExisting: true };
    }

    const applicationId = await this.submitFromInvitation(tx, invitation, job, actorUserId, input);
    return { applicationId, linkedExisting: false };
  }

  /**
   * Lời mời đã ACCEPTED theo kiểu cũ (chỉ mở hội thoại) mà chưa có đơn: ứng viên bấm
   * "Ứng tuyển ngay" (AD-28 mục 5, bước 4 của plan).
   */
  async applyFromAccepted(userId: string, invitationId: string, input: AcceptApplicationInput): Promise<{ applicationId: string }> {
    const candidateId = await this.requireCandidateId(userId);
    const applicationId = await this.prisma.$transaction(async (tx) => {
      const invitation = await this.repository.findByIdTx(invitationId, tx);
      if (!invitation || invitation.candidateId !== candidateId) {
        throw new AppError(404, "Không tìm thấy lời mời.");
      }
      if (invitation.status !== "ACCEPTED") {
        throw new AppError(409, "Chỉ ứng tuyển được từ lời mời đã nhận.");
      }
      if (await this.repository.findApplicationIdByInvitation(invitation.id, tx)) {
        throw new AppError(409, "Bạn đã ứng tuyển từ lời mời này.");
      }
      const existing = await this.applicationsRepository.findByJobAndCandidate(invitation.jobPostId, candidateId, tx);
      if (existing && existing.status !== "CANCELLED") {
        throw new AppError(409, "Bạn đã ứng tuyển tin này.");
      }
      const job = await this.requireOpenJob(tx, invitation.jobPostId);
      return this.submitFromInvitation(tx, invitation, job, userId, input);
    });
    return { applicationId };
  }

  /**
   * Hội thoại như AD-15 mục 6, sau commit. createConversation dùng client riêng và trả
   * hội thoại cũ nếu đã có; lỗi chỉ ghi log — ứng viên vẫn tự mở hội thoại được từ tin.
   */
  async openConversation(userId: string, jobPostId: string, invitationId: string): Promise<string | null> {
    try {
      const conversation = await this.messagingService.createConversation(userId, "CANDIDATE", jobPostId);
      return conversation.id;
    } catch (error) {
      this.logger.error("Accept outreach invitation: create conversation failed", {
        invitationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async submitFromInvitation(
    tx: Prisma.TransactionClient,
    invitation: InvitationWithRelations,
    job: { title: string; employer: { userId: string } },
    actorUserId: string,
    input: AcceptApplicationInput,
  ): Promise<string> {
    const applicationId = await submitApplicationInTx(this.applicationsRepository, tx, {
      candidateId: invitation.candidateId,
      actorUserId,
      jobPostId: invitation.jobPostId,
      cvId: input.cvId,
      coverLetter: input.coverLetter,
      initialStatus: "REVIEWING",
      invitationId: invitation.id,
    });
    // Q2 — người mời + người đăng tin, bỏ trùng (lời mời tự động đứng tên người đăng tin).
    const recipients = [...new Set([invitation.employer.userId, job.employer.userId])];
    await this.notificationsService.notifyMany(
      "CANDIDATE_OUTREACH_INVITATION_RESPONDED",
      recipients,
      {
        invitationId: invitation.id,
        jobPostId: invitation.jobPostId,
        jobPostTitle: job.title,
        candidateName: invitation.candidate.fullName,
        accepted: true,
        applicationId,
      },
      tx,
    );
    return applicationId;
  }

  /** Quyết định 6 — tin phải còn PUBLISHED và chưa quá hạn, đọc trong transaction. */
  private async requireOpenJob(tx: Prisma.TransactionClient, jobPostId: string) {
    const job = await this.repository.findJobForAcceptance(jobPostId, tx);
    if (!job || job.status !== "PUBLISHED" || (job.expiresAt && job.expiresAt.getTime() < Date.now())) {
      throw new AppError(409, INVITATION_NO_LONGER_VALID);
    }
    return job;
  }

  private async requireCandidateId(userId: string): Promise<string> {
    const candidate = await this.prisma.candidate.findUnique({ where: { userId }, select: { id: true } });
    if (!candidate) throw new AppError(404, "Candidate profile not found");
    return candidate.id;
  }
}
