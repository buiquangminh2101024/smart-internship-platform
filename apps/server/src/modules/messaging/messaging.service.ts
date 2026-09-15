import type { Role } from "@prisma/client";
import { AppError } from "../../shared/errors/AppError";
import type { CandidateRepository } from "../candidates/candidate.repository";
import type { EmployerRepository } from "../employers/employer.repository";
import type { JobPostRepository } from "../job-posts/job-post.repository";
import type { MessagingRepository } from "./messaging.repository";

import { toConversationDto, toMessageDto } from "./messaging.mapper";

export class MessagingService {
  private readonly messagingRepository: MessagingRepository;
  private readonly candidateRepository: CandidateRepository;
  private readonly employerRepository: EmployerRepository;
  private readonly jobPostRepository: JobPostRepository;

  constructor({
    messagingRepository,
    candidateRepository,
    employerRepository,
    jobPostRepository,
  }: {
    messagingRepository: MessagingRepository;
    candidateRepository: CandidateRepository;
    employerRepository: EmployerRepository;
    jobPostRepository: JobPostRepository;
  }) {
    this.messagingRepository = messagingRepository;
    this.candidateRepository = candidateRepository;
    this.employerRepository = employerRepository;
    this.jobPostRepository = jobPostRepository;
  }

  async getConversations(userId: string, role: Role) {
    if (role === "CANDIDATE") {
      const candidate = await this.requireCandidate(userId);
      const convs = await this.messagingRepository.findConversationsByCandidateId(candidate.id);
      return this.enrichWithLatestMessages(convs);
    } else if (role === "EMPLOYER") {
      const employer = await this.requireEmployer(userId);
      const convs = await this.messagingRepository.findConversationsByEmployerId(employer.id);
      return this.enrichWithLatestMessages(convs);
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
    if (!content || content.trim() === "") {
      throw new AppError(400, "Message content cannot be empty");
    }
    const message = await this.messagingRepository.saveMessage(conversationId, userId, content);
    return { message: toMessageDto(message), conversation: conv };
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
