import { Prisma, type ApplicationStatus, type JobPostStatus, type OutreachInvitationSource } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { EmployerApplicationsFocus, EmployerApplicationsSort } from "@sip/shared-types";
import { NOW_UTC } from "../candidate-outreach/candidate-outreach.repository";
import { jobPostInclude } from "../job-posts/job-post.repository";
import { AWAITING_SCHEDULE } from "../interviews/interviews.repository";
import { VISIBLE_JOB } from "../match-scores/match-score.repository";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Bộ lọc của trang "Ứng viên" cấp công ty. `status` và `focus` chỉ áp cho danh sách,
 * không cho các số đếm.
 */
export interface CompanyApplicationFilter {
  jobPostId?: string | undefined;
  q?: string | undefined;
}

export interface CompanyApplicationRow {
  applicationId: string;
  status: ApplicationStatus;
  appliedAt: Date;
  candidateId: string;
  candidateName: string | null;
  candidateAvatarUrl: string | null;
  universityName: string | null;
  jobPostId: string;
  jobPostTitle: string;
  jobPostStatus: JobPostStatus;
  awaitingSchedule: boolean;
  nextInterviewAt: Date | null;
  lastInterviewAt: Date | null;
  requiredMatched: number;
  requiredTotal: number;
  optionalMatched: number;
  optionalTotal: number;
  /** Điểm lưu sẵn (AD-24); null ⇒ không có dòng điểm. */
  matchScore: number | null;
  /** AD-28 — lời mời sinh ra đơn; nguồn null khi đơn không đến từ lời mời. */
  invitationId: string | null;
  invitationSource: OutreachInvitationSource | null;
  /** X của tin (`autoOutreachMinScore`). */
  matchThreshold: number;
  /** Y của tin như đã lưu; kẹp Y < X ở `matchBand`. */
  rejectSuggestBelowScore: number;
  changedBySystem: boolean;
  needsResult: boolean;
}

export interface FocusCountsRow {
  reject: number;
  result: number;
}

/** Đủ để kiểm tra chuyển trạng thái và soạn thông báo APPLICATION_STATUS_CHANGED. */
export interface StatusChangeTarget {
  id: string;
  status: ApplicationStatus;
  jobPostId: string;
  jobPostTitle: string;
  companyName: string;
  candidateUserId: string;
}

/** Mốc nộp: lần ứng tuyển lại gần nhất, không có thì lúc tạo — cùng mốc với dashboard. */
export const APPLIED_AT = Prisma.sql`COALESCE(a."reappliedAt", a."createdAt")`;

/**
 * Tên trường của học vấn đại diện cho ứng viên `c`: isCurrent trước, rồi endYear
 * lớn nhất, rồi dòng tạo mới nhất — cùng thứ tự với dashboard và thẻ tìm ứng viên.
 */
const REPRESENTATIVE_UNIVERSITY = Prisma.sql`(
  SELECT un."name" FROM educations e
  LEFT JOIN universities un ON un."id" = e."universityId"
  WHERE e."candidateId" = c."id"
  ORDER BY e."isCurrent" DESC, e."endYear" DESC NULLS LAST, e."createdAt" DESC
  LIMIT 1)`;

/** Bỏ dấu tiếng Việt, giữ hoa thường: "Nguyễn Đức" → "Nguyen Duc". */
export function stripVietnameseMarks(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

const VIETNAMESE_LOWER = "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ";
/** Bảng cho `translate()` của Postgres: mọi chữ có dấu (thường và hoa, dạng dựng sẵn) → chữ không dấu. */
export const VIETNAMESE_MARKED = VIETNAMESE_LOWER + VIETNAMESE_LOWER.toUpperCase();
export const VIETNAMESE_UNMARKED = stripVietnameseMarks(VIETNAMESE_MARKED);

/**
 * Bản không dấu, chữ thường của cột `column` để so với từ khoá đã bỏ dấu. `normalize`
 * đưa chữ tổ hợp (e + dấu rời) về dạng dựng sẵn trước khi `translate`; `lower` sau cùng
 * chỉ còn chữ ASCII nên không phụ thuộc collation của DB. Không có extension `unaccent`.
 */
function unmarked(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`lower(translate(normalize(${column}, NFC), ${VIETNAMESE_MARKED}, ${VIETNAMESE_UNMARKED}))`;
}

/** Từ khoá → mẫu ILIKE: bỏ dấu, chữ thường, thoát `\`, `%`, `_` (ký tự thoát mặc định là `\`). */
export function containsPattern(q: string): string {
  return `%${stripVietnameseMarks(q).toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
}

/** Điều kiện chung (bí danh `a` applications, `j` job_posts, `c` candidates, `u` users). */
function companyWhere(companyId: string, filter: CompanyApplicationFilter): Prisma.Sql {
  const conditions = [Prisma.sql`j."companyId" = ${companyId}`];
  if (filter.jobPostId) conditions.push(Prisma.sql`a."jobPostId" = ${filter.jobPostId}`);
  if (filter.q) {
    // Gõ có dấu hay không dấu đều khớp ("nguyen" ra "Nguyễn"). Email không có dấu nên so thẳng.
    const pattern = containsPattern(filter.q);
    conditions.push(Prisma.sql`(${unmarked(Prisma.sql`c."fullName"`)} ILIKE ${pattern} OR u."email" ILIKE ${pattern})`);
  }
  return Prisma.join(conditions, " AND ");
}

const COMPANY_FROM = Prisma.sql`
  FROM applications a
  JOIN job_posts j ON j."id" = a."jobPostId"
  JOIN candidates c ON c."id" = a."candidateId"
  JOIN users u ON u."id" = c."userId"`;

/** Điểm lưu sẵn của hồ sơ (AD-24). Khoá chính của bảng điểm là đúng cặp này nên không nhân dòng. */
const MATCH_SCORE_JOIN = Prisma.sql`
  LEFT JOIN job_candidate_match_scores ms ON ms."jobPostId" = a."jobPostId" AND ms."candidateId" = a."candidateId"`;

// ─── AD-25: tự xử lý hồ sơ ─────────────────────────────────────────────────

/** Buổi phỏng vấn gần nhất đã diễn ra: lịch SCHEDULED có giờ đã qua (AD-16 M2 không lưu COMPLETED). */
export const LAST_INTERVIEW_AT = Prisma.sql`(
  SELECT MAX(i."scheduledAt") FROM interviews i
  WHERE i."applicationId" = a."id" AND i."status" = 'SCHEDULED' AND i."scheduledAt" <= ${NOW_UTC})`;

/** Đã phỏng vấn, không có lịch sắp tới, chưa có kết quả. Chỉ Rút gọn / Mời PV mới có lịch. */
export const NEEDS_RESULT = Prisma.sql`(
  a."status" IN ('SHORTLISTED', 'INTERVIEWING')
  AND EXISTS (SELECT 1 FROM interviews i
              WHERE i."applicationId" = a."id" AND i."status" = 'SCHEDULED' AND i."scheduledAt" <= ${NOW_UTC})
  AND NOT EXISTS (SELECT 1 FROM interviews i
                  WHERE i."applicationId" = a."id" AND i."status" = 'SCHEDULED' AND i."scheduledAt" > ${NOW_UTC}))`;

/** Y thực dùng — cùng quy tắc với `effectiveRejectThreshold` (application-automation.policy.ts). */
const REJECT_SUGGEST_THRESHOLD = Prisma.sql`GREATEST(0, LEAST(j."rejectSuggestBelowScore", j."autoOutreachMinScore" - 1))`;

/** Đề xuất từ chối: Chờ duyệt, tin đang hiển thị, có điểm và điểm < Y. Cần `MATCH_SCORE_JOIN`. */
const SUGGEST_REJECT = Prisma.sql`(
  a."status" = 'PENDING' AND ${VISIBLE_JOB} AND ms."score" < ${REJECT_SUGGEST_THRESHOLD})`;

const FOCUS_WHERE: Record<EmployerApplicationsFocus, Prisma.Sql> = {
  reject: SUGGEST_REJECT,
  result: NEEDS_RESULT,
};

/**
 * Lần đổi trạng thái gần nhất do hệ thống làm: dòng lịch sử mới nhất có `actorId` null và
 * không phải dòng khởi tạo (8 dòng khởi tạo `actorId` null có sẵn trên Neon — bước 0).
 */
const CHANGED_BY_SYSTEM = Prisma.sql`COALESCE((
  SELECT h."actorId" IS NULL AND h."fromStatus" IS NOT NULL FROM application_status_history h
  WHERE h."applicationId" = a."id"
  ORDER BY h."createdAt" DESC, h."id" DESC
  LIMIT 1), FALSE)`;

/**
 * D10: tỉ lệ kỹ năng bắt buộc khớp (tin không có kỹ năng bắt buộc ⇒ NULL, xếp cuối),
 * rồi số kỹ năng không bắt buộc khớp, rồi nộp sớm trước. Luôn kết thúc bằng id để
 * cùng tham số trên cùng dữ liệu cho cùng trang.
 */
const ORDER_BY: Record<EmployerApplicationsSort, Prisma.Sql> = {
  oldest: Prisma.sql`${APPLIED_AT} ASC, a."id" ASC`,
  newest: Prisma.sql`${APPLIED_AT} DESC, a."id" DESC`,
  skills: Prisma.sql`sm."requiredMatched"::float / NULLIF(sm."requiredTotal", 0) DESC NULLS LAST,
    sm."optionalMatched" DESC, ${APPLIED_AT} ASC, a."id" ASC`,
  // AD-25: điểm lưu sẵn cao nhất trước, chưa có điểm xếp cuối.
  match: Prisma.sql`ms."score" DESC NULLS LAST, ${APPLIED_AT} ASC, a."id" ASC`,
};

export type ApplicationWithCandidateRelations = Prisma.ApplicationGetPayload<{
  include: {
    jobPost: { include: typeof jobPostInclude };
    cv: true;
  };
}>;

export type ApplicationWithEmployerRelations = Prisma.ApplicationGetPayload<{
  include: {
    jobPost: { include: typeof jobPostInclude };
    cv: true;
    candidate: {
      include: {
        user: true;
        city: true;
        educations: { include: { university: true; major: true } };
        skills: { include: { skill: true } };
        workExperiences: true;
        projects: true;
        certificates: true;
        awards: true;
      };
    };
    invitation: { select: { id: true; source: true } };
  };
}>;

export class ApplicationsRepository {
  private readonly prisma: PrismaClient;
  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  async create(
    data: {
      jobPostId: string;
      candidateId: string;
      cvId: string;
      coverLetter?: string | null;
      status: ApplicationStatus;
      invitationId?: string | null;
    },
    db: Db = this.prisma,
  ) {
    return db.application.create({
      data,
    });
  }

  /** AD-16 — mỗi lần đổi trạng thái ghi một dòng; `fromStatus = null` là dòng khởi tạo. */
  async createStatusHistory(
    data: { applicationId: string; fromStatus: ApplicationStatus | null; toStatus: ApplicationStatus; actorId: string | null },
    db: Db = this.prisma,
  ) {
    return db.applicationStatusHistory.create({ data });
  }

  async findByJobAndCandidate(jobPostId: string, candidateId: string, db: Db = this.prisma) {
    return db.application.findUnique({
      where: {
        jobPostId_candidateId: { jobPostId, candidateId },
      },
    });
  }

  async findCandidateApplications(candidateId: string): Promise<ApplicationWithCandidateRelations[]> {
    return this.prisma.application.findMany({
      where: { candidateId },
      include: {
        jobPost: { include: jobPostInclude },
        cv: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findCandidateApplicationById(id: string, candidateId: string): Promise<ApplicationWithCandidateRelations | null> {
    return this.prisma.application.findFirst({
      where: { id, candidateId },
      include: {
        jobPost: { include: jobPostInclude },
        cv: true,
      },
    });
  }

  async findEmployerApplicationsByJobId(jobPostId: string, companyId: string, status?: ApplicationStatus): Promise<ApplicationWithEmployerRelations[]> {
    return this.prisma.application.findMany({
      where: {
        jobPostId,
        jobPost: { companyId },
        ...(status ? { status } : {}),
      },
      include: {
        jobPost: { include: jobPostInclude },
        cv: true,
        candidate: {
          include: {
            user: true,
            city: true,
            educations: { include: { university: true, major: true } },
            skills: { include: { skill: true } },
            workExperiences: true,
            projects: true,
            certificates: true,
            awards: true,
          },
        },
        invitation: { select: { id: true, source: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findEmployerApplicationById(id: string, companyId: string): Promise<ApplicationWithEmployerRelations | null> {
    return this.prisma.application.findFirst({
      where: {
        id,
        jobPost: { companyId },
      },
      include: {
        jobPost: { include: jobPostInclude },
        cv: true,
        candidate: {
          include: {
            user: true,
            city: true,
            educations: { include: { university: true, major: true } },
            skills: { include: { skill: true } },
            workExperiences: true,
            projects: true,
            certificates: true,
            awards: true,
          },
        },
        invitation: { select: { id: true, source: true } },
      },
    });
  }

  async jobPostBelongsToCompany(jobPostId: string, companyId: string): Promise<boolean> {
    const jobPost = await this.prisma.jobPost.findFirst({ where: { id: jobPostId, companyId }, select: { id: true } });
    return jobPost !== null;
  }

  /**
   * Một trang hồ sơ của mọi tin trong công ty. `skillMatch` tính trong cùng câu (kỹ năng
   * của tin LEFT JOIN kỹ năng của ứng viên theo skillId) nên `sort=skills` sắp trước khi
   * chia trang. Không xét minYears và kỹ năng gần nghĩa (việc của Job Matcher).
   * Điểm phù hợp đọc từ bảng điểm lưu sẵn (AD-24, AD-25), không chấm trực tiếp.
   */
  listForCompany(
    companyId: string,
    filter: CompanyApplicationFilter & {
      status?: ApplicationStatus | undefined;
      focus?: EmployerApplicationsFocus | undefined;
    },
    options: { sort: EmployerApplicationsSort; offset: number; limit: number },
  ): Promise<CompanyApplicationRow[]> {
    const statusFilter = filter.status ? Prisma.sql`AND a."status" = CAST(${filter.status} AS "ApplicationStatus")` : Prisma.empty;
    const focusFilter = filter.focus ? Prisma.sql`AND ${FOCUS_WHERE[filter.focus]}` : Prisma.empty;
    return this.prisma.$queryRaw<CompanyApplicationRow[]>(Prisma.sql`
      SELECT a."id" AS "applicationId", a."status"::text AS "status", ${APPLIED_AT} AS "appliedAt",
             c."id" AS "candidateId", c."fullName" AS "candidateName", c."avatarUrl" AS "candidateAvatarUrl",
             ${REPRESENTATIVE_UNIVERSITY} AS "universityName",
             j."id" AS "jobPostId", j."title" AS "jobPostTitle", j."status"::text AS "jobPostStatus",
             ${AWAITING_SCHEDULE} AS "awaitingSchedule",
             (SELECT MIN(i."scheduledAt") FROM interviews i
              WHERE i."applicationId" = a."id" AND i."status" = 'SCHEDULED' AND i."scheduledAt" > NOW()) AS "nextInterviewAt",
             ${LAST_INTERVIEW_AT} AS "lastInterviewAt",
             sm."requiredMatched", sm."requiredTotal", sm."optionalMatched", sm."optionalTotal",
             ms."score" AS "matchScore",
             a."invitationId",
             (SELECT inv."source"::text FROM candidate_outreach_invitations inv
              WHERE inv."id" = a."invitationId") AS "invitationSource",
             j."autoOutreachMinScore" AS "matchThreshold",
             j."rejectSuggestBelowScore" AS "rejectSuggestBelowScore",
             ${CHANGED_BY_SYSTEM} AS "changedBySystem",
             ${NEEDS_RESULT} AS "needsResult"
      ${COMPANY_FROM}
      ${MATCH_SCORE_JOIN}
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE s."importance" = 'REQUIRED')::int AS "requiredTotal",
               COUNT(cs."skillId") FILTER (WHERE s."importance" = 'REQUIRED')::int AS "requiredMatched",
               COUNT(*) FILTER (WHERE s."importance" <> 'REQUIRED')::int AS "optionalTotal",
               COUNT(cs."skillId") FILTER (WHERE s."importance" <> 'REQUIRED')::int AS "optionalMatched"
        FROM job_post_skills s
        LEFT JOIN candidate_skills cs ON cs."skillId" = s."skillId" AND cs."candidateId" = a."candidateId"
        WHERE s."jobPostId" = a."jobPostId"
      ) sm ON TRUE
      WHERE ${companyWhere(companyId, filter)} ${statusFilter} ${focusFilter}
      ORDER BY ${ORDER_BY[options.sort]}
      LIMIT ${options.limit} OFFSET ${options.offset}
    `);
  }

  /** Số hồ sơ theo trạng thái (áp `jobPostId`, `q`), chỉ các trạng thái có hồ sơ. */
  countByStatus(companyId: string, filter: CompanyApplicationFilter): Promise<Array<{ status: ApplicationStatus; count: number }>> {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT a."status"::text AS "status", COUNT(*)::int AS "count"
      ${COMPANY_FROM}
      WHERE ${companyWhere(companyId, filter)}
      GROUP BY a."status"
    `);
  }

  /**
   * Số hồ sơ của từng nhóm gợi ý (AD-25), áp `jobPostId`, `q`, không áp `status`. Hai nhóm chỉ
   * gồm Chờ duyệt / Rút gọn / Mời PV nên lọc trước theo trạng thái để bớt câu con.
   */
  async countFocus(companyId: string, filter: CompanyApplicationFilter): Promise<FocusCountsRow> {
    const [row] = await this.prisma.$queryRaw<FocusCountsRow[]>(Prisma.sql`
      SELECT COUNT(*) FILTER (WHERE ${SUGGEST_REJECT})::int AS "reject",
             COUNT(*) FILTER (WHERE ${NEEDS_RESULT})::int AS "result"
      ${COMPANY_FROM}
      ${MATCH_SCORE_JOIN}
      WHERE ${companyWhere(companyId, filter)}
        AND a."status" IN ('PENDING', 'SHORTLISTED', 'INTERVIEWING')
    `);
    return { reject: row?.reject ?? 0, result: row?.result ?? 0 };
  }

  /** Mọi tin có ít nhất một hồ sơ khớp `q` (không áp `jobPostId`, `status`), xếp theo tên tin. */
  countByJob(
    companyId: string,
    q: string | undefined,
  ): Promise<Array<{ jobPostId: string; title: string; status: JobPostStatus; count: number }>> {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT j."id" AS "jobPostId", j."title" AS "title", j."status"::text AS "status", COUNT(*)::int AS "count"
      ${COMPANY_FROM}
      WHERE ${companyWhere(companyId, { q })}
      GROUP BY j."id", j."title", j."status"
      ORDER BY j."title", j."id"
    `);
  }

  /**
   * Số hồ sơ theo trạng thái, chỉ trên các tin đang hiển thị (PUBLISHED) — cho trợ lý hỗ trợ
   * (F1, tool `getApplicationsSummary`). Khác `countByStatus` (trang "Ứng viên", đếm mọi tin):
   * viết riêng để không đụng `companyWhere`, và không join ứng viên vì chỉ cần con số.
   */
  async countByStatusOnOpenJobs(companyId: string): Promise<Array<{ status: ApplicationStatus; count: number }>> {
    const rows = await this.prisma.application.groupBy({
      by: ["status"],
      where: { jobPost: { companyId, status: "PUBLISHED" } },
      _count: { _all: true },
    });
    return rows.map((row) => ({ status: row.status, count: row._count._all }));
  }

  /** Hồ sơ trong `ids` thuộc công ty; id không thuộc công ty thì không có trong kết quả. */
  async findManyForStatusChange(ids: string[], companyId: string, db: Db = this.prisma): Promise<StatusChangeTarget[]> {
    const rows = await db.application.findMany({
      where: { id: { in: ids }, jobPost: { companyId } },
      select: {
        id: true,
        status: true,
        jobPostId: true,
        candidate: { select: { userId: true } },
        jobPost: { select: { title: true, company: { select: { name: true } } } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      jobPostId: row.jobPostId,
      jobPostTitle: row.jobPost.title,
      companyName: row.jobPost.company.name,
      candidateUserId: row.candidate.userId,
    }));
  }

  /**
   * Chỉ đổi khi trạng thái vẫn là `from` — điều kiện nằm trong câu UPDATE nên người
   * khác đổi chen vào giữa lúc đọc và lúc ghi thì không bị ghi đè. Trả về số dòng đã đổi (0 hoặc 1).
   */
  async updateStatusIf(id: string, from: ApplicationStatus, to: ApplicationStatus, db: Db = this.prisma): Promise<number> {
    const result = await db.application.updateMany({ where: { id, status: from }, data: { status: to } });
    return result.count;
  }

  async update(
    id: string,
    data: Partial<{
      status: ApplicationStatus;
      employerNotes: string | null;
      rating: number | null;
      cvId: string;
      coverLetter: string | null;
      reappliedAt: Date;
      invitationId: string;
    }>,
    db: Db = this.prisma,
  ) {
    return db.application.update({
      where: { id },
      data,
    });
  }
}
