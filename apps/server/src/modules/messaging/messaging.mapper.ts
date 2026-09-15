import type { ConversationWithRelations } from "./messaging.repository";
import type { Conversation, ConversationParticipant, ConversationJobPostInfo, Message } from "@sip/shared-types";

export function toConversationDto(entity: ConversationWithRelations): Conversation {
  return {
    id: entity.id,
    jobPostId: entity.jobPostId,
    candidateId: entity.candidateId,
    employerId: entity.employerId,
    candidateLastReadAt: entity.candidateLastReadAt?.toISOString() || null,
    employerLastReadAt: entity.employerLastReadAt?.toISOString() || null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
    jobPost: {
      id: entity.jobPost.id,
      title: entity.jobPost.title,
      companyName: entity.jobPost.company.name,
    },
    candidate: {
      id: entity.candidate.id,
      name: entity.candidate.user.email.split("@")[0] || "", // Fallback for name
      avatarUrl: entity.candidate.avatarUrl,
    },
    employer: {
      id: entity.employer.id,
      name: entity.employer.user.email.split("@")[0] || "", // Fallback
      avatarUrl: null,
    },
  };
}

export function toMessageDto(entity: any): Message {
  return {
    id: entity.id,
    conversationId: entity.conversationId,
    senderId: entity.senderId,
    content: entity.content,
    createdAt: entity.createdAt.toISOString(),
  };
}
