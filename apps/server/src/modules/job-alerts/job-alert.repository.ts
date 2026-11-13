import { Prisma, type PrismaClient } from "@prisma/client";
import { VISIBLE_JOB } from "../match-scores/match-score.repository";

/** Ứng viên vừa được ghi vào `job_alerts` cho một tin. */
export interface InsertedJobAlert {
  candidateId: string;
  userId: string;
  score: number;
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

/** Job alert (0.5, AD-26 D7–D9): ghi cặp đã báo, đếm theo ngày, cài đặt của ứng viên. */
export class JobAlertRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  /**
   * Một câu: chọn ứng viên cần báo cho tin vừa chấm và ghi vào `job_alerts`; cặp đã có thì
   * bỏ qua (mỗi cặp chỉ báo một lần). Trả về đúng các cặp vừa ghi. Điều kiện:
   * - tin đang hiển thị; điểm trong bảng ≥ max(`autoOutreachMinScore` của tin, `minScoreFloor`) (D7);
   * - ứng viên bật job alert; bật "chỉ thành phố của tôi" thì phải cùng thành phố với tin
   *   (hồ sơ hoặc tin không có thành phố ⇒ không báo) (D9);
   * - tài khoản `ACTIVE` (bị khoá hay chưa xác thực thì không đăng nhập được để xem);
   * - chưa ứng tuyển tin (mọi trạng thái trừ `CANCELLED`) và chưa nhận lời mời
   *   `PENDING` / `ACCEPTED` / `DECLINED` của tin — cùng quy tắc D3 với "Việc làm phù hợp".
   */
  async insertForJob(jobPostId: string, minScoreFloor: number, createdAt: Date): Promise<InsertedJobAlert[]> {
    return this.prisma.$queryRaw<InsertedJobAlert[]>(Prisma.sql`
      WITH inserted AS (
        INSERT INTO job_alerts ("candidateId", "jobPostId", "score", "createdAt")
        SELECT s."candidateId", s."jobPostId", s."score", ${createdAt}
        FROM job_candidate_match_scores s
        JOIN job_posts j ON j."id" = s."jobPostId"
        JOIN candidates c ON c."id" = s."candidateId"
        JOIN users u ON u."id" = c."userId"
        WHERE s."jobPostId" = ${jobPostId}
          AND ${VISIBLE_JOB}
          AND s."score" >= GREATEST(j."autoOutreachMinScore", ${minScoreFloor})
          AND c."jobAlertEnabled"
          AND (NOT c."jobAlertSameCityOnly" OR c."cityId" = j."cityId")
          AND u."status" = 'ACTIVE'
          AND NOT EXISTS (
            SELECT 1 FROM applications a
            WHERE a."jobPostId" = s."jobPostId" AND a."candidateId" = s."candidateId" AND a."status" <> 'CANCELLED')
          AND NOT EXISTS (
            SELECT 1 FROM candidate_outreach_invitations i
            WHERE i."jobPostId" = s."jobPostId" AND i."candidateId" = s."candidateId"
              AND i."status" IN ('PENDING', 'ACCEPTED', 'DECLINED'))
        ON CONFLICT ("candidateId", "jobPostId") DO NOTHING
        RETURNING "candidateId", "score"
      )
      SELECT ins."candidateId", c."userId", ins."score"
      FROM inserted ins
      JOIN candidates c ON c."id" = ins."candidateId"
      ORDER BY ins."score" DESC, ins."candidateId"
    `);
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
