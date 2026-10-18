import { Prisma, type JobPostStatus, type OutreachInvitationStatus, type PrismaClient } from "@prisma/client";
import { BLOCKING_INVITATION_STATUSES } from "./candidate-outreach.config";

type Db = PrismaClient | Prisma.TransactionClient;

// Đọc candidates (+ quan hệ), applications, conversations; đọc/ghi
// candidate_outreach_invitations và đúng 1 cột candidates.isOpenToOutreach.
// Không sửa module candidates/applications/messaging.

/** Thông tin hiển thị trên thẻ kết quả tìm — cố ý KHÔNG select phone/email/dateOfBirth (D2). */
export interface CandidateSearchCardRow {
  candidateId: string;
  fullName: string | null;
  avatarUrl: string | null;
  headline: string | null;
  cityName: string | null;
  education: { universityName: string | null; majorName: string | null; degree: string | null } | null;
}

const invitationInclude = {
  jobPost: { select: { id: true, title: true, status: true } },
  company: { select: { id: true, name: true, logoUrl: true } },
  employer: { select: { id: true, userId: true } },
  candidate: { select: { id: true, userId: true, fullName: true } },
} satisfies Prisma.CandidateOutreachInvitationInclude;

export type InvitationWithRelations = Prisma.CandidateOutreachInvitationGetPayload<{
  include: typeof invitationInclude;
}>;

export interface OutreachEmployer {
  id: string;
  companyId: string;
  company: { id: string; name: string; verifiedAt: Date | null };
}

export interface OutreachJobPost {
  id: string;
  title: string;
  status: JobPostStatus;
  employerId: string;
  companyId: string;
}

/** Bộ lọc của danh sách lời mời cấp công ty; `status` là trạng thái hiển thị. */
export interface CompanyInvitationFilter {
  status?: OutreachInvitationStatus | undefined;
  jobPostId?: string | undefined;
  /** Chỉ lời mời do employer này gửi. */
  employerId?: string | undefined;
  /** Id lời mời cuối của trang trước — lấy các dòng xếp sau nó theo (createdAt, id). */
  afterId?: string | undefined;
}

export interface InvitationCountsRow {
  total: number;
  pending: number;
  accepted: number;
  declined: number;
  expired: number;
}

export interface OutreachJobRow {
  id: string;
  title: string;
  status: JobPostStatus;
  expiresAt: Date | null;
  employerId: string;
}

// Các cột DateTime lưu UTC không múi giờ ⇒ so với now() quy về UTC (giống dashboard.repository).
const NOW_UTC = Prisma.sql`(now() AT TIME ZONE 'UTC')`;

/**
 * Trạng thái hiển thị trong SQL — cùng quy tắc với `effectiveStatus` của mapper:
 * PENDING đã quá expiresAt hoặc tin không còn PUBLISHED ⇒ EXPIRED (sweep chỉ chạy
 * mỗi giờ). Cần alias `i` (lời mời) và `j` (tin). Mọi chỗ lọc / đếm theo trạng thái
 * của trang "Lời mời" dùng hằng này để số đếm khớp nhãn trên từng dòng.
 */
const EFFECTIVE_STATUS = Prisma.sql`(CASE
  WHEN i."status" = 'PENDING' AND (i."expiresAt" <= ${NOW_UTC} OR j."status" <> 'PUBLISHED') THEN 'EXPIRED'
  ELSE i."status"::text
END)`;

const COUNT_COLUMNS = Prisma.sql`
  COUNT(*)::int AS "total",
  COUNT(*) FILTER (WHERE ${EFFECTIVE_STATUS} = 'PENDING')::int AS "pending",
  COUNT(*) FILTER (WHERE ${EFFECTIVE_STATUS} = 'ACCEPTED')::int AS "accepted",
  COUNT(*) FILTER (WHERE ${EFFECTIVE_STATUS} = 'DECLINED')::int AS "declined",
  COUNT(*) FILTER (WHERE ${EFFECTIVE_STATUS} = 'EXPIRED')::int AS "expired"`;

const EMPTY_COUNTS: InvitationCountsRow = { total: 0, pending: 0, accepted: 0, declined: 0, expired: 0 };

export interface CreateInvitationData {
  companyId: string;
  employerId: string;
  jobPostId: string;
  candidateId: string;
  expiresAt: Date;
  /** D7 — điểm lúc gửi; null khi không chấm được. */
  matchScore: number | null;
  matchWeightsVersion: string | null;
}

export class CandidateOutreachRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  // ─── Chủ thể ──────────────────────────────────────────────────────────────

  // AD-19: id/companyId của employer lấy từ EmployerIdentityCache; company đọc riêng
  // (mới nhất) cho các API cần hạn mức theo gói hoặc tên công ty.
  findOutreachCompany(companyId: string): Promise<OutreachEmployer["company"] | null> {
    return this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, verifiedAt: true } });
  }

  findJobPost(jobPostId: string): Promise<OutreachJobPost | null> {
    return this.prisma.jobPost.findUnique({
      where: { id: jobPostId },
      select: { id: true, title: true, status: true, employerId: true, companyId: true },
    });
  }

  // ─── Tìm ứng viên — giai đoạn A (SQL lọc thô) ─────────────────────────────

  /**
   * Danh sách "Gợi ý" (D6): id ứng viên bật isOpenToOutreach, chưa ứng tuyển tin này
   * (mọi trạng thái đơn, kể cả đã huỷ), chưa có lời mời bị chặn theo Q4 cho tin này
   * (người đó nằm ở "Đã mời"; chỉ EXPIRED mới quay lại pool), có giao ít nhất 1 kỹ
   * năng APPROVED với tin (REQUIRED ∪ PREFERRED). Nhiều kỹ năng giao hơn xếp trước
   * để LIMIT không cắt mất người khớp nhất. Không lọc theo ngành/kinh nghiệm — để
   * hybrid ở giai đoạn B phản ánh qua điểm.
   */
  async searchCandidatePool(jobPostId: string, limit: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT cs."candidateId" AS id
      FROM candidate_skills cs
      JOIN job_post_skills jps ON jps."skillId" = cs."skillId" AND jps."jobPostId" = ${jobPostId}
      JOIN skills s ON s."id" = cs."skillId" AND s."status" = 'APPROVED'
      JOIN candidates c ON c."id" = cs."candidateId" AND c."isOpenToOutreach" = true
      WHERE NOT EXISTS (
        SELECT 1 FROM applications a
        WHERE a."candidateId" = cs."candidateId" AND a."jobPostId" = ${jobPostId}
      )
      AND NOT EXISTS (
        SELECT 1 FROM candidate_outreach_invitations i
        WHERE i."candidateId" = cs."candidateId" AND i."jobPostId" = ${jobPostId}
          AND i."status"::text IN (${Prisma.join(BLOCKING_INVITATION_STATUSES)})
      )
      GROUP BY cs."candidateId"
      ORDER BY COUNT(*) DESC, cs."candidateId"
      LIMIT ${limit}
    `);
    return rows.map((row) => row.id);
  }

  /**
   * Thẻ hiển thị theo đúng thứ tự `candidateIds`; id không còn tồn tại bị bỏ qua.
   * Học vấn đại diện: isCurrent trước, rồi endYear lớn nhất, rồi dòng tạo mới nhất.
   */
  async findSearchCards(candidateIds: string[]): Promise<CandidateSearchCardRow[]> {
    if (candidateIds.length === 0) return [];
    const rows = await this.prisma.candidate.findMany({
      where: { id: { in: candidateIds } },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        headline: true,
        city: { select: { name: true } },
        educations: {
          select: {
            degree: true,
            university: { select: { name: true } },
            major: { select: { name: true } },
          },
          orderBy: [{ isCurrent: "desc" }, { endYear: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
          take: 1,
        },
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return candidateIds.flatMap((id): CandidateSearchCardRow[] => {
      const row = byId.get(id);
      if (!row) return [];
      const education = row.educations[0];
      return [
        {
          candidateId: row.id,
          fullName: row.fullName,
          avatarUrl: row.avatarUrl,
          headline: row.headline,
          cityName: row.city?.name ?? null,
          education: education
            ? {
                universityName: education.university?.name ?? null,
                majorName: education.major?.name ?? null,
                degree: education.degree,
              }
            : null,
        },
      ];
    });
  }

  /** Ứng viên trong `candidateIds` từng có lời mời EXPIRED cho tin này — nhãn "Lời mời trước đã hết hạn". */
  async findExpiredInvitedCandidateIds(jobPostId: string, candidateIds: string[]): Promise<Set<string>> {
    if (candidateIds.length === 0) return new Set();
    const rows = await this.prisma.candidateOutreachInvitation.findMany({
      where: { jobPostId, candidateId: { in: candidateIds }, status: "EXPIRED" },
      select: { candidateId: true },
      distinct: ["candidateId"],
    });
    return new Set(rows.map((row) => row.candidateId));
  }

  // ─── Kiểm tra trước khi mời ───────────────────────────────────────────────

  findCandidateForInvite(candidateId: string): Promise<{ id: string; userId: string; isOpenToOutreach: boolean } | null> {
    return this.prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { id: true, userId: true, isOpenToOutreach: true },
    });
  }

  async hasApplied(candidateId: string, jobPostId: string): Promise<boolean> {
    const application = await this.prisma.application.findUnique({
      where: { jobPostId_candidateId: { jobPostId, candidateId } },
      select: { id: true },
    });
    return application !== null;
  }

  /** Q4 — lời mời PENDING/ACCEPTED/DECLINED của đúng cặp; chỉ EXPIRED mới cho mời lại. */
  async hasBlockingInvitation(candidateId: string, jobPostId: string): Promise<boolean> {
    const invitation = await this.prisma.candidateOutreachInvitation.findFirst({
      where: { candidateId, jobPostId, status: { in: BLOCKING_INVITATION_STATUSES } },
      select: { id: true },
    });
    return invitation !== null;
  }

  // ─── CRUD lời mời ─────────────────────────────────────────────────────────

  create(data: CreateInvitationData, db: Db = this.prisma): Promise<InvitationWithRelations> {
    return db.candidateOutreachInvitation.create({ data, include: invitationInclude });
  }

  findById(id: string): Promise<InvitationWithRelations | null> {
    return this.prisma.candidateOutreachInvitation.findUnique({ where: { id }, include: invitationInclude });
  }

  /**
   * Danh sách "Đã mời" (D6) của 1 tin: mọi trạng thái kể cả EXPIRED, mới nhất trước.
   * Không phân trang — số dòng bị chặn trên bởi hạn mức lời mời/ngày của công ty.
   */
  listForJobPost(jobPostId: string): Promise<InvitationWithRelations[]> {
    return this.prisma.candidateOutreachInvitation.findMany({
      where: { jobPostId },
      include: invitationInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  /** Hộp lời mời của Candidate: mọi trạng thái, mới nhất trước. */
  listForCandidate(candidateId: string): Promise<InvitationWithRelations[]> {
    return this.prisma.candidateOutreachInvitation.findMany({
      where: { candidateId },
      include: invitationInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  // ─── Trang "Lời mời" cấp công ty (docs/06-backend/outreach-hub/PLAN.md) ──

  /**
   * Id lời mời của công ty theo bộ lọc, mới nhất trước, tối đa `take` dòng. Lọc trạng
   * thái bằng EFFECTIVE_STATUS nên phải chạy SQL; dòng đầy đủ lấy bằng `findManyByIds`.
   */
  async listCompanyInvitationIds(companyId: string, filter: CompanyInvitationFilter, take: number): Promise<string[]> {
    const conditions = [Prisma.sql`i."companyId" = ${companyId}`];
    if (filter.status) conditions.push(Prisma.sql`${EFFECTIVE_STATUS} = ${filter.status}`);
    if (filter.jobPostId) conditions.push(Prisma.sql`i."jobPostId" = ${filter.jobPostId}`);
    if (filter.employerId) conditions.push(Prisma.sql`i."employerId" = ${filter.employerId}`);
    if (filter.afterId) {
      conditions.push(Prisma.sql`(i."createdAt", i."id") < (
        SELECT c."createdAt", c."id" FROM candidate_outreach_invitations c WHERE c."id" = ${filter.afterId}
      )`);
    }
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT i."id"
      FROM candidate_outreach_invitations i
      JOIN job_posts j ON j."id" = i."jobPostId"
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY i."createdAt" DESC, i."id" DESC
      LIMIT ${take}
    `);
    return rows.map((row) => row.id);
  }

  /** Dòng đầy đủ theo đúng thứ tự `ids`; id không còn tồn tại bị bỏ qua. */
  async findManyByIds(ids: string[]): Promise<InvitationWithRelations[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.candidateOutreachInvitation.findMany({
      where: { id: { in: ids } },
      include: invitationInclude,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  /** Cursor hợp lệ = id một lời mời của chính công ty. */
  async isCompanyInvitation(companyId: string, id: string): Promise<boolean> {
    const row = await this.prisma.candidateOutreachInvitation.findFirst({ where: { id, companyId }, select: { id: true } });
    return row !== null;
  }

  /** Số lời mời theo từng tin của công ty, trạng thái hiển thị. Tin chưa có lời mời không có trong Map. */
  async countByJobPost(companyId: string): Promise<Map<string, InvitationCountsRow>> {
    const rows = await this.prisma.$queryRaw<Array<InvitationCountsRow & { jobPostId: string }>>(Prisma.sql`
      SELECT i."jobPostId", ${COUNT_COLUMNS}
      FROM candidate_outreach_invitations i
      JOIN job_posts j ON j."id" = i."jobPostId"
      WHERE i."companyId" = ${companyId}
      GROUP BY i."jobPostId"
    `);
    return new Map(rows.map(({ jobPostId, ...counts }) => [jobPostId, counts]));
  }

  /** Lời mời của công ty gửi trong 30 ngày — cùng mốc với dashboardRepository.outreachLast30Days. */
  async countLast30Days(companyId: string): Promise<InvitationCountsRow> {
    const [row] = await this.prisma.$queryRaw<InvitationCountsRow[]>(Prisma.sql`
      SELECT ${COUNT_COLUMNS}
      FROM candidate_outreach_invitations i
      JOIN job_posts j ON j."id" = i."jobPostId"
      WHERE i."companyId" = ${companyId} AND i."createdAt" > ${NOW_UTC} - interval '30 days'
    `);
    return row ?? EMPTY_COUNTS;
  }

  /** Tin PUBLISHED của công ty cùng các tin đã có lời mời (bộ lọc theo tin cần cả tin đã đóng). */
  findOutreachJobs(companyId: string): Promise<OutreachJobRow[]> {
    return this.prisma.jobPost.findMany({
      where: { companyId, OR: [{ status: "PUBLISHED" }, { outreachInvitations: { some: {} } }] },
      select: { id: true, title: true, status: true, expiresAt: true, employerId: true },
    });
  }

  /**
   * Chuyển PENDING → ACCEPTED/DECLINED có điều kiện (còn PENDING, chưa quá expiresAt)
   * trong 1 câu UPDATE — 2 request trả lời cùng lúc hoặc chạy đua với sweep thì
   * chỉ 1 bên thắng. Trả false nếu lời mời không còn trả lời được (service ⇒ 409).
   */
  async respondIfPending(id: string, status: "ACCEPTED" | "DECLINED", db: Db = this.prisma): Promise<boolean> {
    const now = new Date();
    const result = await db.candidateOutreachInvitation.updateMany({
      where: { id, status: "PENDING", expiresAt: { gt: now } },
      data: { status, respondedAt: now },
    });
    return result.count === 1;
  }

  /** conversationId theo từng jobPostId của Candidate — gắn vào lời mời ACCEPTED trong hộp lời mời. */
  async findConversationIdsByJobPost(candidateId: string, jobPostIds: string[]): Promise<Map<string, string>> {
    if (jobPostIds.length === 0) return new Map();
    const rows = await this.prisma.conversation.findMany({
      where: { candidateId, jobPostId: { in: jobPostIds } },
      select: { id: true, jobPostId: true },
    });
    return new Map(rows.map((row) => [row.jobPostId, row.id]));
  }

  /**
   * Ứng viên trong `candidateIds` mà công ty còn xem được hồ sơ — cùng 3 đường
   * truy cập với CandidateService.getEmployerCandidateProfile (đã ứng tuyển tin
   * của công ty / có lời mời ACCEPTED của công ty / đang bật isOpenToOutreach).
   */
  async findProfileAccessibleCandidateIds(companyId: string, candidateIds: string[]): Promise<Set<string>> {
    if (candidateIds.length === 0) return new Set();
    const rows = await this.prisma.candidate.findMany({
      where: {
        id: { in: candidateIds },
        OR: [
          { isOpenToOutreach: true },
          { applications: { some: { jobPost: { companyId } } } },
          { outreachInvitations: { some: { companyId, status: "ACCEPTED" } } },
        ],
      },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }

  // ─── Cài đặt của Candidate ────────────────────────────────────────────────

  async findCandidateIdByUserId(userId: string): Promise<string | null> {
    const candidate = await this.prisma.candidate.findUnique({ where: { userId }, select: { id: true } });
    return candidate?.id ?? null;
  }

  /** Chỉ ghi đúng 1 cột. Q5: không đụng tới lời mời PENDING hiện có. */
  async updateOpenToOutreach(candidateId: string, isOpenToOutreach: boolean): Promise<boolean> {
    const row = await this.prisma.candidate.update({
      where: { id: candidateId },
      data: { isOpenToOutreach },
      select: { isOpenToOutreach: true },
    });
    return row.isOpenToOutreach;
  }

  // ─── dùng cho cron candidate-outreach-expiry.job.ts ──────────────────────

  /** PENDING quá expiresAt, hoặc PENDING của tin không còn PUBLISHED (Q3) → EXPIRED hàng loạt. */
  async expireOverdue(): Promise<number> {
    const result = await this.prisma.candidateOutreachInvitation.updateMany({
      where: {
        status: "PENDING",
        OR: [{ expiresAt: { lte: new Date() } }, { jobPost: { status: { not: "PUBLISHED" } } }],
      },
      data: { status: "EXPIRED" },
    });
    return result.count;
  }
}
