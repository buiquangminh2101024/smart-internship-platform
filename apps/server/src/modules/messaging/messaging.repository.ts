import type { Prisma, PrismaClient, Role } from "@prisma/client";

const conversationInclude = {
  jobPost: { select: { id: true, title: true, status: true, company: { select: { name: true } } } },
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
      // Hội thoại chính candidate đã xoá thì ẩn khỏi danh sách của họ.
      where: { candidateId, candidateDeletedAt: null },
      include: conversationInclude,
      orderBy: { updatedAt: "desc" },
    });
  }

  async findConversationsByEmployerId(employerId: string): Promise<ConversationWithRelations[]> {
    return this.prisma.conversation.findMany({
      where: { employerId, employerDeletedAt: null },
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

  /**
   * Đánh dấu xoá phía `role`; nếu phía kia cũng đã xoá thì xoá cứng hội thoại
   * (Message cascade theo). Chạy trong 1 transaction — race 2 phía xoá cùng
   * mili-giây được chấp nhận, xem CONVERSATION_SOFT_DELETE_PLAN.md mục 3.
   */
  async softDeleteConversationSide(conversationId: string, role: Role, date: Date): Promise<{ hardDeleted: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.ConversationUpdateInput =
        role === "CANDIDATE" ? { candidateDeletedAt: date } : { employerDeletedAt: date };
      const updated = await tx.conversation.update({ where: { id: conversationId }, data });
      if (updated.candidateDeletedAt && updated.employerDeletedAt) {
        await tx.conversation.delete({ where: { id: conversationId } });
        return { hardDeleted: true };
      }
      return { hardDeleted: false };
    });
  }

  /**
   * Đếm hội thoại có tin nhắn của phía kia mới hơn mốc đọc của user. So sánh
   * cột với cột qua quan hệ nên phải dùng raw SQL (Prisma filter không hỗ trợ).
   */
  async countUnreadConversations(role: Role, participantId: string, userId: string): Promise<number> {
    const rows =
      role === "CANDIDATE"
        ? await this.prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*) AS count FROM "conversations" c
            WHERE c."candidateId" = ${participantId}
              AND c."candidateDeletedAt" IS NULL
              AND EXISTS (
                SELECT 1 FROM "messages" m
                WHERE m."conversationId" = c."id"
                  AND m."senderId" <> ${userId}
                  AND (c."candidateLastReadAt" IS NULL OR m."createdAt" > c."candidateLastReadAt")
              )`
        : await this.prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*) AS count FROM "conversations" c
            WHERE c."employerId" = ${participantId}
              AND c."employerDeletedAt" IS NULL
              AND EXISTS (
                SELECT 1 FROM "messages" m
                WHERE m."conversationId" = c."id"
                  AND m."senderId" <> ${userId}
                  AND (c."employerLastReadAt" IS NULL OR m."createdAt" > c."employerLastReadAt")
              )`;
    return Number(rows[0]?.count ?? 0);
  }

  /** Application khớp (candidateId, jobPostId) của từng hội thoại — dùng cho link "CV ứng viên". */
  async findApplicationIdsForConversations(pairs: { candidateId: string; jobPostId: string }[]) {
    if (pairs.length === 0) return [];
    return this.prisma.application.findMany({
      where: { OR: pairs.map(({ candidateId, jobPostId }) => ({ candidateId, jobPostId })) },
      select: { id: true, candidateId: true, jobPostId: true },
    });
  }

  async getLatestMessage(conversationId: string) {
    return this.prisma.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
    });
  }
}
