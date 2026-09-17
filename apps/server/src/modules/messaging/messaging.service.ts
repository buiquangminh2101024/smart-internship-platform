import type { JobPostStatus, Role } from "@prisma/client";
import type { DeleteConversationResponse, Message, UnreadCountResponse } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { RealtimeNotifier } from "../../shared/ports/RealtimeNotifier";
import type { CandidateRepository } from "../candidates/candidate.repository";
import type { EmployerRepository } from "../employers/employer.repository";
import type { JobPostRepository } from "../job-posts/job-post.repository";
import type { ConversationWithRelations, MessagingRepository } from "./messaging.repository";

import { toConversationDto, toMessageDto } from "./messaging.mapper";

const MESSAGE_PREVIEW_LENGTH = 100;
// Chỉ tin đã đóng/hết hạn/bị gỡ mới cho xoá hội thoại (AD-11).
const DELETABLE_JOB_POST_STATUSES: readonly JobPostStatus[] = ["CLOSED", "EXPIRED", "TAKEN_DOWN"];

export class MessagingService {
  private readonly messagingRepository: MessagingRepository;
  private readonly candidateRepository: CandidateRepository;
  private readonly employerRepository: EmployerRepository;
  private readonly jobPostRepository: JobPostRepository;
  private readonly realtimeNotifier: RealtimeNotifier;
  private readonly logger: Logger;

  constructor({
    messagingRepository,
    candidateRepository,
    employerRepository,
    jobPostRepository,
    realtimeNotifier,
    logger,
  }: {
    messagingRepository: MessagingRepository;
    candidateRepository: CandidateRepository;
    employerRepository: EmployerRepository;
    jobPostRepository: JobPostRepository;
    realtimeNotifier: RealtimeNotifier;
    logger: Logger;
  }) {
    this.messagingRepository = messagingRepository;
    this.candidateRepository = candidateRepository;
    this.employerRepository = employerRepository;
    this.jobPostRepository = jobPostRepository;
    this.realtimeNotifier = realtimeNotifier;
    this.logger = logger;
  }

  async getConversations(userId: string, role: Role) {
    if (role === "CANDIDATE") {
      const candidate = await this.requireCandidate(userId);
      const convs = await this.messagingRepository.findConversationsByCandidateId(candidate.id);
      return this.enrichWithLatestMessages(convs);
    } else if (role === "EMPLOYER") {
      const employer = await this.requireEmployer(userId);
      const convs = await this.messagingRepository.findConversationsByEmployerId(employer.id);
      const enriched = await this.enrichWithLatestMessages(convs);
      // Link "CV ứng viên" chỉ có khi ứng viên đã nộp đơn vào đúng tin này —
      // hội thoại do employer chủ động mở trước thì applicationId = null.
      const applications = await this.messagingRepository.findApplicationIdsForConversations(
        convs.map((c) => ({ candidateId: c.candidateId, jobPostId: c.jobPostId })),
      );
      return enriched.map((conv) => ({
        ...conv,
        applicationId:
          applications.find((a) => a.candidateId === conv.candidateId && a.jobPostId === conv.jobPostId)?.id ?? null,
      }));
    }
    throw new AppError(403, "Invalid role for messaging");
  }

  async getUnreadSummary(userId: string, role: Role): Promise<UnreadCountResponse> {
    if (role === "CANDIDATE") {
      const candidate = await this.requireCandidate(userId);
      return { count: await this.messagingRepository.countUnreadConversations(role, candidate.id, userId) };
    } else if (role === "EMPLOYER") {
      const employer = await this.requireEmployer(userId);
      return { count: await this.messagingRepository.countUnreadConversations(role, employer.id, userId) };
    }
    throw new AppError(403, "Invalid role for messaging");
  }

  async createConversation(userId: string, role: Role, jobPostId: string, targetCandidateId?: string) {
    const jobPost = await this.jobPostRepository.findById(jobPostId);
    if (!jobPost) {
      throw new AppError(404, "Job post not found");
    }

    let candidateId: string;

    if (role === "CANDIDATE") {
      const candidate = await this.requireCandidate(userId);
      candidateId = candidate.id;
    } else if (role === "EMPLOYER") {
      const employer = await this.requireEmployer(userId);
      if (jobPost.employerId !== employer.id) {
        throw new AppError(403, "You do not own this job post");
      }
      if (!targetCandidateId) {
        throw new AppError(400, "Candidate ID is required when employer initiates");
      }
      candidateId = targetCandidateId;
    } else {
      throw new AppError(403, "Invalid role");
    }

    // Check if conversation already exists
    const existing = await this.messagingRepository.findConversationByCandidateAndJobPost(candidateId, jobPostId);
    if (existing) {
      return toConversationDto(existing);
    }

    const created = await this.messagingRepository.createConversation({
      candidateId,
      employerId: jobPost.employerId,
      jobPostId: jobPost.id,
    });
    return toConversationDto(created);
  }

  async getMessages(userId: string, role: Role, conversationId: string, cursor?: string) {
    await this.requireConversationAccess(userId, role, conversationId);
    const result = await this.messagingRepository.findMessagesByConversationId(conversationId, cursor);
    return {
      items: result.items.map(toMessageDto),
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    };
  }

  async markAsRead(userId: string, role: Role, conversationId: string) {
    await this.requireConversationAccess(userId, role, conversationId);
    return this.messagingRepository.updateReadState(conversationId, role, new Date());
  }

  async saveMessage(userId: string, role: Role, conversationId: string, content: string) {
    const conv = await this.requireConversationAccess(userId, role, conversationId);
    if (conv.candidateDeletedAt || conv.employerDeletedAt) {
      throw new AppError(409, "Cuộc hội thoại không còn khả dụng để nhắn tin", "CONVERSATION_UNAVAILABLE");
    }
    if (!content || content.trim() === "") {
      throw new AppError(400, "Message content cannot be empty");
    }
    const message = await this.messagingRepository.saveMessage(conversationId, userId, content);
    return { message: toMessageDto(message), conversation: conv };
  }

  /**
   * Xoá mềm phía người gọi; phía kia cũng đã xoá thì xoá cứng. Chỉ phía chưa
   * xoá mới được báo realtime để khoá ô nhập (phía đã xoá không còn thấy hội
   * thoại trong danh sách).
   */
  async deleteConversation(userId: string, role: Role, conversationId: string): Promise<DeleteConversationResponse> {
    const conv = await this.requireConversationAccess(userId, role, conversationId);
    if (!DELETABLE_JOB_POST_STATUSES.includes(conv.jobPost.status)) {
      throw new AppError(400, "Chỉ có thể xoá hội thoại khi tin tuyển dụng đã đóng, hết hạn hoặc bị gỡ");
    }

    // Bấm xoá 2 lần (double-click/2 tab) coi như thành công, không làm gì thêm.
    const ownDeletedAt = role === "CANDIDATE" ? conv.candidateDeletedAt : conv.employerDeletedAt;
    if (ownDeletedAt) return { hardDeleted: false };

    const result = await this.messagingRepository.softDeleteConversationSide(conversationId, role, new Date());

    if (!result.hardDeleted) {
      const otherUserId = role === "CANDIDATE" ? conv.employer.userId : conv.candidate.userId;
      try {
        await this.realtimeNotifier.notifyConversationUnavailable(otherUserId, { conversationId });
      } catch (error) {
        this.logger.error("Push conversation:unavailable thất bại", { conversationId, error });
      }
    }
    return result;
  }

  /**
   * Báo "có tin nhắn mới" cho phía còn lại của hội thoại — cùng một nhánh cho
   * cả candidate lẫn employer (thông báo đối xứng). Best-effort: lỗi push chỉ
   * log, tin nhắn đã lưu xong.
   */
  async notifyRecipient(conversation: ConversationWithRelations, senderUserId: string, message: Message) {
    const senderIsCandidate = conversation.candidate.userId === senderUserId;
    const recipientUserId = senderIsCandidate ? conversation.employer.userId : conversation.candidate.userId;
    const dto = toConversationDto(conversation);
    const senderName = senderIsCandidate ? dto.candidate.name : dto.employer.name;
    const preview = message.content.length > MESSAGE_PREVIEW_LENGTH
      ? `${message.content.slice(0, MESSAGE_PREVIEW_LENGTH)}…`
      : message.content;

    try {
      await this.realtimeNotifier.pushMessageToUser(recipientUserId, {
        conversationId: conversation.id,
        senderName,
        preview,
        createdAt: new Date(message.createdAt),
      });
    } catch (error) {
      this.logger.error("Push thông báo tin nhắn thất bại", { conversationId: conversation.id, error });
    }
  }

  private async enrichWithLatestMessages(conversations: any[]) {
    return Promise.all(
      conversations.map(async (conv) => {
        const latestMessage = await this.messagingRepository.getLatestMessage(conv.id);
        return { 
          ...toConversationDto(conv), 
          latestMessage: latestMessage ? toMessageDto(latestMessage) : null 
        };
      })
    );
  }

  private async requireCandidate(userId: string) {
    const candidate = await this.candidateRepository.findByUserId(userId);
    if (!candidate) throw new AppError(404, "Candidate profile not found");
    return candidate;
  }

  private async requireEmployer(userId: string) {
    const employer = await this.employerRepository.findByUserId(userId);
    if (!employer) throw new AppError(404, "Employer profile not found");
    return employer;
  }

  async requireConversationAccess(userId: string, role: Role, conversationId: string) {
    const conv = await this.messagingRepository.findConversationById(conversationId);
    if (!conv) {
      throw new AppError(404, "Conversation not found");
    }

    if (role === "CANDIDATE") {
      const candidate = await this.requireCandidate(userId);
      if (conv.candidateId !== candidate.id) {
        throw new AppError(403, "You do not have access to this conversation");
      }
    } else if (role === "EMPLOYER") {
      const employer = await this.requireEmployer(userId);
      if (conv.employerId !== employer.id) {
        throw new AppError(403, "You do not have access to this conversation");
      }
    } else {
      throw new AppError(403, "Invalid role");
    }
    return conv;
  }
}
