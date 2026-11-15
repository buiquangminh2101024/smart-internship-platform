import { Prisma, type PrismaClient } from "@prisma/client";
import { VISIBLE_JOB } from "../match-scores/match-score.repository";

type Db = PrismaClient | Prisma.TransactionClient;

/** Ứng viên vừa được ghi vào `job_alerts` cho một tin. */
export interface InsertedJobAlert {
  candidateId: string;
  userId: string;
  score: number;
}

/** Một cặp vừa ghi vào `job_alerts` khi ứng viên lần đầu có điểm (0.6, Q3), kèm thông tin tin. */
export interface FirstScoredJobAlert extends InsertedJobAlert {
  jobPostId: string;
  jobPostTitle: string;
  companyName: string;
}

export interface JobAlertJobSummary {
  title: string;
  companyName: string;
}

export interface CandidateJobAlertSettingsRow {
  candidateId: string;
  cityId: string | null;
  cityName: string | null;
  enabled: boolean;
  emailEnabled: boolean;
  sameCityOnly: boolean;
}

/** Ứng viên có dòng `job_alerts` chưa xét cho email gộp. */
export interface PendingDigestCandidate {
  candidateId: string;
  userId: string;
  email: string;
  /** Bật job alert và email job alert, tài khoản `ACTIVE`. false ⇒ chỉ đánh dấu đã xét, không gửi. */
  sendable: boolean;
  pending: number;
}

/** Một tin trong email gộp. */
export interface DigestJobRow {
  jobPostId: string;
  title: string;
  companyName: string;
  score: number;
}

export interface SkillsReminderTarget {
  candidateId: string;
  userId: string;
}

export type JobAlertSettingsPatch = Partial<Pick<CandidateJobAlertSettingsRow, "enabled" | "emailEnabled" | "sameCityOnly">>;

const SETTINGS_SELECT = {
  id: true,
  cityId: true,
  city: { select: { name: true } },
  jobAlertEnabled: true,
  jobAlertEmailEnabled: true,
  jobAlertSameCityOnly: true,
} satisfies Prisma.CandidateSelect;

type SettingsRecord = Prisma.CandidateGetPayload<{ select: typeof SETTINGS_SELECT }>;

function toSettingsRow(record: SettingsRecord): CandidateJobAlertSettingsRow {
  return {
    candidateId: record.id,
    cityId: record.cityId,
    cityName: record.city?.name ?? null,
    enabled: record.jobAlertEnabled,
    emailEnabled: record.jobAlertEmailEnabled,
    sameCityOnly: record.jobAlertSameCityOnly,
  };
}

/**
 * Ứng viên `c` chưa ứng tuyển tin `j` (mọi trạng thái trừ `CANCELLED`) và chưa nhận lời mời
 * `PENDING` / `ACCEPTED` / `DECLINED` của tin — cùng quy tắc D3 với "Việc làm phù hợp".
 */
const NOT_APPLIED_OR_INVITED = Prisma.sql`
  NOT EXISTS (
    SELECT 1 FROM applications ap
    WHERE ap."jobPostId" = j."id" AND ap."candidateId" = c."id" AND ap."status" <> 'CANCELLED')
  AND NOT EXISTS (
    SELECT 1 FROM candidate_outreach_invitations inv
    WHERE inv."jobPostId" = j."id" AND inv."candidateId" = c."id"
      AND inv."status" IN ('PENDING', 'ACCEPTED', 'DECLINED'))
`;

/**
 * Người nhận job alert — dùng chung cho lượt thật theo tin (`insertForJob`), `--dry-run`
 * (`countTargetsForJob`) và lần đầu có điểm (`insertFirstForCandidates`, 0.6). `scope` lọc
 * theo tin hoặc theo ứng viên. Bí danh `s` (điểm), `j`, `c`, `u`. Điều kiện:
 * - tin đang hiển thị; điểm trong bảng ≥ max(`autoOutreachMinScore` của tin, `minScoreFloor`) (D7);
 * - ứng viên bật job alert; bật "chỉ thành phố của tôi" thì phải cùng thành phố với tin
 *   (hồ sơ hoặc tin không có thành phố ⇒ không báo) (D9);
 * - tài khoản `ACTIVE` (bị khoá hay chưa xác thực thì không đăng nhập được để xem);
 * - D3 (`NOT_APPLIED_OR_INVITED`).
 */
function alertTargetsSource(scope: Prisma.Sql, minScoreFloor: number): Prisma.Sql {
  return Prisma.sql`
    FROM job_candidate_match_scores s
    JOIN job_posts j ON j."id" = s."jobPostId"
    JOIN candidates c ON c."id" = s."candidateId"
    JOIN users u ON u."id" = c."userId"
    WHERE ${scope}
      AND ${VISIBLE_JOB}
      AND s."score" >= GREATEST(j."autoOutreachMinScore", ${minScoreFloor})
      AND c."jobAlertEnabled"
      AND (NOT c."jobAlertSameCityOnly" OR c."cityId" = j."cityId")
      AND u."status" = 'ACTIVE'
      AND ${NOT_APPLIED_OR_INVITED}
  `;
}

/** Job alert (0.5, AD-26 D7–D10): ghi cặp đã báo, đếm theo ngày, email gộp, nhắc kỹ năng, cài đặt. */
export class JobAlertRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  /**
   * Một câu: chọn người nhận cho tin vừa chấm (`alertTargetsSource`) và ghi vào `job_alerts`; cặp
   * đã có thì bỏ qua (mỗi cặp chỉ báo một lần). Trả về đúng các cặp vừa ghi, điểm cao trước.
   */
  async insertForJob(jobPostId: string, minScoreFloor: number, createdAt: Date): Promise<InsertedJobAlert[]> {
    return this.prisma.$queryRaw<InsertedJobAlert[]>(Prisma.sql`
      WITH inserted AS (
        INSERT INTO job_alerts ("candidateId", "jobPostId", "score", "createdAt")
        SELECT s."candidateId", s."jobPostId", s."score", ${createdAt}
        ${alertTargetsSource(Prisma.sql`s."jobPostId" = ${jobPostId}`, minScoreFloor)}
        ON CONFLICT ("candidateId", "jobPostId") DO NOTHING
        RETURNING "candidateId", "score"
      )
      SELECT ins."candidateId", c."userId", ins."score"
      FROM inserted ins
      JOIN candidates c ON c."id" = ins."candidateId"
      ORDER BY ins."score" DESC, ins."candidateId"
    `);
  }

  /**
   * Job alert lần đầu (0.6, AD-27 mục 6, Q3), một câu cho cả lô: với các ứng viên **chưa từng
   * có dòng `job_alerts` nào**, ghi mọi tin đạt điều kiện (`alertTargetsSource`, cùng luật với
   * `insertForJob`), chỉ với dòng có điểm đầy đủ (không `semanticPending`). Ứng viên đã từng được báo thì bỏ qua cả người, để sửa hồ sơ về sau không
   * sinh báo. Trả các cặp vừa ghi kèm tiêu đề tin, theo ứng viên, điểm cao trước.
   */
  async insertFirstForCandidates(candidateIds: string[], minScoreFloor: number, createdAt: Date): Promise<FirstScoredJobAlert[]> {
    if (candidateIds.length === 0) return [];
    // Chỉ dòng có điểm đầy đủ: không báo theo điểm rule-only (chờ embedding / model lỗi).
    const scope = Prisma.sql`s."candidateId" IN (${Prisma.join(candidateIds)})
      AND NOT s."semanticPending"
      AND NOT EXISTS (SELECT 1 FROM job_alerts prior WHERE prior."candidateId" = s."candidateId")`;
    return this.prisma.$queryRaw<FirstScoredJobAlert[]>(Prisma.sql`
      WITH inserted AS (
        INSERT INTO job_alerts ("candidateId", "jobPostId", "score", "createdAt")
        SELECT s."candidateId", s."jobPostId", s."score", ${createdAt}
        ${alertTargetsSource(scope, minScoreFloor)}
        ON CONFLICT ("candidateId", "jobPostId") DO NOTHING
        RETURNING "candidateId", "jobPostId", "score"
      )
      SELECT ins."candidateId", c."userId", ins."score", ins."jobPostId",
             j."title" AS "jobPostTitle", co."name" AS "companyName"
      FROM inserted ins
      JOIN candidates c ON c."id" = ins."candidateId"
      JOIN job_posts j ON j."id" = ins."jobPostId"
      JOIN companies co ON co."id" = j."companyId"
      ORDER BY ins."candidateId", ins."score" DESC, ins."jobPostId"
    `);
  }

  /** `--dry-run` của script: số người đạt điều kiện và trong đó bao nhiêu người đã được báo tin này. */
  async countTargetsForJob(jobPostId: string, minScoreFloor: number): Promise<{ eligible: number; alreadyAlerted: number }> {
    const rows = await this.prisma.$queryRaw<Array<{ eligible: number; alreadyAlerted: number }>>(Prisma.sql`
      SELECT count(*)::int AS "eligible",
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM job_alerts ja WHERE ja."candidateId" = s."candidateId" AND ja."jobPostId" = s."jobPostId"
             ))::int AS "alreadyAlerted"
      ${alertTargetsSource(Prisma.sql`s."jobPostId" = ${jobPostId}`, minScoreFloor)}
    `);
    return rows[0] ?? { eligible: 0, alreadyAlerted: 0 };
  }

  /** Số tin đã báo cho từng ứng viên kể từ `since` (đầu ngày giờ VN). Ứng viên không có dòng ⇒ không có trong Map. */
  async countSince(candidateIds: string[], since: Date): Promise<Map<string, number>> {
    if (candidateIds.length === 0) return new Map();
    const rows = await this.prisma.jobAlert.groupBy({
      by: ["candidateId"],
      where: { candidateId: { in: candidateIds }, createdAt: { gte: since } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.candidateId, row._count._all]));
  }

  async findJobSummary(jobPostId: string): Promise<JobAlertJobSummary | null> {
    const job = await this.prisma.jobPost.findUnique({
      where: { id: jobPostId },
      select: { title: true, company: { select: { name: true } } },
    });
    return job ? { title: job.title, companyName: job.company.name } : null;
  }

  // ─── Email gộp (bước 6) ──────────────────────────────────────────────────

  /** Ứng viên có dòng chưa xét (`emailedAt IS NULL`) tạo trước `cutoff`, kèm số dòng. */
  findPendingDigestCandidates(cutoff: Date): Promise<PendingDigestCandidate[]> {
    return this.prisma.$queryRaw<PendingDigestCandidate[]>(Prisma.sql`
      SELECT c."id" AS "candidateId", c."userId", u."email",
             (c."jobAlertEnabled" AND c."jobAlertEmailEnabled" AND u."status" = 'ACTIVE') AS "sendable",
             count(*)::int AS "pending"
      FROM job_alerts a
      JOIN candidates c ON c."id" = a."candidateId"
      JOIN users u ON u."id" = c."userId"
      WHERE a."emailedAt" IS NULL AND a."createdAt" <= ${cutoff}
      GROUP BY c."id", c."userId", u."email", u."status"
      ORDER BY c."id"
    `);
  }

  /**
   * Đánh dấu đã xét mà không gửi, cho ứng viên tắt email / tắt alert / tài khoản không còn
   * `ACTIVE`: không để dồn dòng cũ rồi gửi một lượt khi họ bật lại. Trả số dòng đã đánh dấu.
   */
  async markWithoutSending(candidateIds: string[], cutoff: Date, now: Date): Promise<number> {
    if (candidateIds.length === 0) return 0;
    const result = await this.prisma.jobAlert.updateMany({
      where: { candidateId: { in: candidateIds }, emailedAt: null, createdAt: { lte: cutoff } },
      data: { emailedAt: now },
    });
    return result.count;
  }

  /**
   * Nhận các dòng chưa xét của một ứng viên (đặt `emailedAt`), trả `jobPostId` đã nhận. Câu
   * UPDATE có điều kiện `emailedAt IS NULL` nên hai lượt chạy chồng nhau (cron và script) không
   * nhận trùng: lượt sau nhận 0 dòng và không gửi thư. Gọi trong transaction cùng outbox.
   */
  async claimForDigest(db: Db, candidateId: string, cutoff: Date, now: Date): Promise<string[]> {
    const rows = await db.$queryRaw<Array<{ jobPostId: string }>>(Prisma.sql`
      UPDATE job_alerts SET "emailedAt" = ${now}
      WHERE "candidateId" = ${candidateId} AND "emailedAt" IS NULL AND "createdAt" <= ${cutoff}
      RETURNING "jobPostId"
    `);
    return rows.map((row) => row.jobPostId);
  }

  /**
   * Các tin trong số `jobPostIds` còn đáng gửi: đang hiển thị, ứng viên chưa ứng tuyển / chưa
   * nhận lời mời kể từ lúc báo. Điểm là điểm lúc báo; điểm cao trước, hoà thì báo sau trước.
   */
  async findDigestJobs(db: Db | undefined, candidateId: string, jobPostIds: string[]): Promise<DigestJobRow[]> {
    if (jobPostIds.length === 0) return [];
    return (db ?? this.prisma).$queryRaw<DigestJobRow[]>(Prisma.sql`
      SELECT j."id" AS "jobPostId", j."title", co."name" AS "companyName", a."score"
      FROM job_alerts a
      JOIN job_posts j ON j."id" = a."jobPostId"
      JOIN companies co ON co."id" = j."companyId"
      JOIN candidates c ON c."id" = a."candidateId"
      WHERE a."candidateId" = ${candidateId}
        AND a."jobPostId" IN (${Prisma.join(jobPostIds)})
        AND ${VISIBLE_JOB}
        AND ${NOT_APPLIED_OR_INVITED}
      ORDER BY a."score" DESC, a."createdAt" DESC, j."id"
    `);
  }

  /** `--dry-run`: các tin chưa xét của một ứng viên (không nhận). */
  async findPendingJobPostIds(candidateId: string, cutoff: Date): Promise<string[]> {
    const rows = await this.prisma.jobAlert.findMany({
      where: { candidateId, emailedAt: null, createdAt: { lte: cutoff } },
      select: { jobPostId: true },
    });
    return rows.map((row) => row.jobPostId);
  }

  runInTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  // ─── Nhắc thêm kỹ năng (bước 6, D10) ─────────────────────────────────────

  /**
   * Ứng viên chưa có kỹ năng nào (mọi trạng thái, cùng cách đếm với độ hoàn thiện), tài khoản
   * `ACTIVE` (đã xác thực, không bị khoá) tạo trước `createdBefore`, chưa được nhắc
   * (`dedupeKey` = `dedupeKeyPrefix` + id ứng viên).
   */
  findSkillsReminderTargets(createdBefore: Date, dedupeKeyPrefix: string): Promise<SkillsReminderTarget[]> {
    return this.prisma.$queryRaw<SkillsReminderTarget[]>(Prisma.sql`
      SELECT c."id" AS "candidateId", c."userId"
      FROM candidates c
      JOIN users u ON u."id" = c."userId"
      WHERE u."status" = 'ACTIVE'
        AND u."createdAt" <= ${createdBefore}
        AND NOT EXISTS (SELECT 1 FROM candidate_skills cs WHERE cs."candidateId" = c."id")
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n."dedupeKey" = ${dedupeKeyPrefix} || c."id")
      ORDER BY u."createdAt", c."id"
    `);
  }

  // ─── Cài đặt ─────────────────────────────────────────────────────────────

  async findSettingsByUserId(userId: string): Promise<CandidateJobAlertSettingsRow | null> {
    const record = await this.prisma.candidate.findUnique({ where: { userId }, select: SETTINGS_SELECT });
    return record ? toSettingsRow(record) : null;
  }

  async updateSettings(candidateId: string, patch: JobAlertSettingsPatch): Promise<CandidateJobAlertSettingsRow> {
    const record = await this.prisma.candidate.update({
      where: { id: candidateId },
      data: {
        ...(patch.enabled !== undefined ? { jobAlertEnabled: patch.enabled } : {}),
        ...(patch.emailEnabled !== undefined ? { jobAlertEmailEnabled: patch.emailEnabled } : {}),
        ...(patch.sameCityOnly !== undefined ? { jobAlertSameCityOnly: patch.sameCityOnly } : {}),
      },
      select: SETTINGS_SELECT,
    });
    return toSettingsRow(record);
  }
}
