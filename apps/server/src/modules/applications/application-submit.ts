import type { Prisma } from "@prisma/client";
import { AppError } from "../../shared/errors/AppError";
import type { ApplicationsRepository } from "./applications.repository";

/**
 * Lõi tạo đơn ứng tuyển, dùng chung cho nộp đơn thường và nhận lời mời (AD-28 mục 9,
 * docs/06-backend/invitation-apply/PLAN.md bước 2). Chạy trong transaction của người gọi;
 * không gửi thông báo — người gọi chọn loại thông báo (`APPLICATION_RECEIVED` hay thông
 * báo gộp của lời mời).
 *
 * Là hàm thay cho method của ApplicationsService để `candidate-outreach` dùng được mà
 * không tạo vòng phụ thuộc DI (ApplicationsService cũng phải gọi phần nhận lời).
 */
export interface SubmitApplicationInput {
  candidateId: string;
  /** userId ghi vào lịch sử trạng thái. */
  actorUserId: string;
  jobPostId: string;
  cvId: string;
  coverLetter?: string | null | undefined;
  /** Nộp thường ⇒ PENDING; từ lời mời ⇒ REVIEWING (AD-28 mục 3). */
  initialStatus: "PENDING" | "REVIEWING";
  invitationId?: string | null | undefined;
}

export async function submitApplicationInTx(
  applicationsRepository: ApplicationsRepository,
  tx: Prisma.TransactionClient,
  input: SubmitApplicationInput,
): Promise<string> {
  const cv = await tx.cv.findUnique({ where: { id: input.cvId }, select: { candidateId: true } });
  if (!cv || cv.candidateId !== input.candidateId) {
    throw new AppError(400, "Invalid CV");
  }

  const existing = await applicationsRepository.findByJobAndCandidate(input.jobPostId, input.candidateId, tx);
  if (existing && existing.status !== "CANCELLED") {
    throw new AppError(400, "You have already applied to this job post");
  }

  // Lấy trước khi update: dòng lịch sử cần trạng thái cũ.
  const fromStatus = existing ? existing.status : null;
  let id: string;
  if (existing) {
    // Đơn đã huỷ (CANCELLED) → ứng tuyển lại trên chính bản ghi cũ.
    await applicationsRepository.update(
      existing.id,
      {
        status: input.initialStatus,
        cvId: input.cvId,
        coverLetter: input.coverLetter ?? null,
        reappliedAt: new Date(),
        ...(input.invitationId ? { invitationId: input.invitationId } : {}),
      },
      tx,
    );
    id = existing.id;
  } else {
    const created = await applicationsRepository.create(
      {
        jobPostId: input.jobPostId,
        candidateId: input.candidateId,
        cvId: input.cvId,
        ...(input.coverLetter ? { coverLetter: input.coverLetter } : {}),
        status: input.initialStatus,
        ...(input.invitationId ? { invitationId: input.invitationId } : {}),
      },
      tx,
    );
    id = created.id;
  }

  await applicationsRepository.createStatusHistory(
    { applicationId: id, fromStatus, toStatus: input.initialStatus, actorId: input.actorUserId },
    tx,
  );
  return id;
}
