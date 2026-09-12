import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Xoá theo thứ tự phụ thuộc khoá ngoại (con trước cha) để tránh lỗi
// foreign key constraint. Không dùng TRUNCATE ... CASCADE vì muốn kiểm
// soát rõ ràng bảng nào bị xoá.
const deletions: { name: string; run: () => Promise<{ count: number }> }[] = [
  { name: "notifications", run: () => prisma.notification.deleteMany() },
  { name: "messages", run: () => prisma.message.deleteMany() },
  { name: "conversations", run: () => prisma.conversation.deleteMany() },
  { name: "applications", run: () => prisma.application.deleteMany() },
  { name: "saved jobs", run: () => prisma.savedJob.deleteMany() },
  { name: "cvs", run: () => prisma.cv.deleteMany() },
  { name: "job post moderation actions", run: () => prisma.jobPostModerationAction.deleteMany() },
  { name: "job post skills", run: () => prisma.jobPostSkill.deleteMany() },
  { name: "job posts", run: () => prisma.jobPost.deleteMany() },
  { name: "payment callback logs", run: () => prisma.paymentCallbackLog.deleteMany() },
  { name: "transactions", run: () => prisma.transaction.deleteMany() },
  { name: "payments", run: () => prisma.payment.deleteMany() },
  { name: "company subscriptions", run: () => prisma.companySubscription.deleteMany() },
  { name: "employers", run: () => prisma.employer.deleteMany() },
  { name: "companies", run: () => prisma.company.deleteMany() },
  { name: "candidate skills", run: () => prisma.candidateSkill.deleteMany() },
  { name: "awards", run: () => prisma.award.deleteMany() },
  { name: "certificates", run: () => prisma.certificate.deleteMany() },
  { name: "projects", run: () => prisma.project.deleteMany() },
  { name: "work experiences", run: () => prisma.workExperience.deleteMany() },
  { name: "educations", run: () => prisma.education.deleteMany() },
  { name: "candidates", run: () => prisma.candidate.deleteMany() },
  { name: "users", run: () => prisma.user.deleteMany() },
];

async function main() {
  if (process.env.CONFIRM_CLEAR_DATA !== "yes") {
    throw new Error(
      'An toàn: cần đặt CONFIRM_CLEAR_DATA=yes để xác nhận xoá dữ liệu (vd: CONFIRM_CLEAR_DATA=yes npm run db:clear -w apps/server).',
    );
  }

  for (const { name, run } of deletions) {
    const { count } = await run();
    console.log(`Deleted ${count} ${name}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
