import type { Prisma, PrismaClient, Role } from "@prisma/client";

const conversationInclude = {
  jobPost: { select: { id: true, title: true, company: { select: { name: true } } } },
  candidate: { select: { id: true, userId: true, user: { select: { email: true } }, avatarUrl: true } },
  employer: { select: { id: true, userId: true, user: { select: { email: true } }, title: true } },
} satisfies Prisma.ConversationInclude;

export type ConversationWithRelations = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

export class MessagingRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  async findConversationsByCandidateId(candidateId: string): Promise<ConversationWithRelations[]> {
    return this.prisma.conversation.findMany({
      where: { candidateId },
      include: conversationInclude,
      orderBy: { updatedAt: "desc" },
    });
  }

  async findConversationsByEmployerId(employerId: string): Promise<ConversationWithRelations[]> {
    return this.prisma.conversation.findMany({
      where: { employerId },
      include: conversationInclude,
      orderBy: { updatedAt: "desc" },
    });
  }

  async findConversationById(id: string): Promise<ConversationWithRelations | null> {
    return this.prisma.conversation.findUnique({
      where: { id },
      include: conversationInclude,
    });
  }

  async findConversationByCandidateAndJobPost(candidateId: string, jobPostId: string): Promise<ConversationWithRelations | null> {
    return this.prisma.conversation.findFirst({
      where: { candidateId, jobPostId },
      include: conversationInclude,
    });
  }

  async createConversation(data: { candidateId: string; employerId: string; jobPostId: string }): Promise<ConversationWithRelations> {
    return this.prisma.conversation.create({
      data,
      include: conversationInclude,
    });
  }

  async findMessagesByConversationId(conversationId: string, cursor?: string, take: number = 20) {
    const args: Prisma.MessageFindManyArgs = {
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: take + 1,
    };
    if (cursor) {
      args.cursor = { id: cursor };
      args.skip = 1;
    }
    const messages = await this.prisma.message.findMany(args);
    const hasMore = messages.length > take;
    const items = hasMore ? messages.slice(0, take) : messages;
    return {
      items,
      hasMore,
      nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
    };
  }

  async saveMessage(conversationId: string, senderId: string, content: string) {
    return this.prisma.message.create({
      data: { conversationId, senderId, content },
    });
  }

  async updateReadState(conversationId: string, role: Role, date: Date) {
    const data: Prisma.ConversationUpdateInput =
      role === "CANDIDATE" ? { candidateLastReadAt: date } : { employerLastReadAt: date };
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data,
    });
  }

  async getLatestMessage(conversationId: string) {
    return this.prisma.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
    });
  }
}
