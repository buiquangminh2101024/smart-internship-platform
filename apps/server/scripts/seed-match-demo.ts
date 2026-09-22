// Dữ liệu demo cho bộ đánh giá Job Matcher GĐ2 (bước 5 trong
// docs/06-backend/job-matcher-phase2/PLAN.md).
//
//   npm run seed-match-demo -- --check        chỉ kiểm fixture với catalog thật (chỉ ĐỌC DB)
//   npm run seed-match-demo                   seed (idempotent — chạy lại là cập nhật)
//   npm run seed-match-demo -- --label-sheet  sinh labels.json rỗng để gán nhãn (không đụng DB ghi)
//   npm run seed-match-demo -- --reset        xoá toàn bộ dữ liệu demo
//
// Đọc scripts/data/match-demo.json (do LLM sinh theo
// docs/06-backend/job-matcher-phase2/eval/synthetic-data-prompt.md).
// Chỉ đụng: User đuôi @match-demo.local, Company demo và tin của nó, và các Skill do
// chính seed này tạo (createdByUserId = employer demo). Không bao giờ đụng dữ liệu thật.
//
// Mỗi lần seed đều gán/ghi đè passwordHash của mọi User demo (candidate + employer)
// thành DEMO_PASSWORD, để người trong nhóm đăng nhập email+password xem thử trên UI.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DEMO_COMPANY_NAME,
  DEMO_EMAIL_DOMAIN,
  DEMO_EMPLOYER_EMAIL,
  parseYearMonth,
  splitOfPair,
  validateMatchDemoFixture,
  type MatchDemoFixture,
} from "./lib/match-demo-fixture";

const FIXTURE_PATH = path.resolve(__dirname, "data/match-demo.json");
const LABELS_PATH = path.resolve(__dirname, "../../../docs/06-backend/job-matcher-phase2/eval/labels.json");
// Mật khẩu demo cho người gán nhãn đăng nhập thử (email + password) — không phải
// dữ liệu nhạy cảm, chỉ dùng nội bộ để xem hồ sơ khi gán nhãn. Cùng SALT_ROUNDS
// với auth.service.ts.
const DEMO_PASSWORD = "123456789";
const DEMO_PASSWORD_SALT_ROUNDS = 12;

const prisma = new PrismaClient();

async function loadCatalog() {
  const employer = await prisma.user.findUnique({ where: { email: DEMO_EMPLOYER_EMAIL }, select: { id: true } });
  // Kỹ năng do lần seed trước tạo không tính là "catalog sẵn có", kẻo lần chạy lại tự báo trùng chính mình.
  // Kỹ năng seed sẵn có createdByUserId = NULL — `NOT (col = x)` loại luôn cả NULL trong SQL, nên phải nêu rõ.
  const skills = await prisma.skill.findMany({
    where: {
      status: "APPROVED",
      ...(employer ? { OR: [{ createdByUserId: null }, { createdByUserId: { not: employer.id } }] } : {}),
    },
    select: { name: true },
  });
  const majors = await prisma.major.findMany({ where: { status: "APPROVED" }, select: { id: true, name: true } });
  return { skills: skills.map((s) => s.name), majors };
}

async function loadFixture(): Promise<MatchDemoFixture> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(FIXTURE_PATH, "utf8"));
  } catch (error) {
    throw new Error(`Không đọc được ${FIXTURE_PATH}: ${error instanceof Error ? error.message : error}`);
  }
  const catalog = await loadCatalog();
  const { fixture, errors, warnings } = validateMatchDemoFixture(raw, {
    skills: catalog.skills,
    majors: catalog.majors.map((m) => m.name),
  });
  for (const warning of warnings) console.warn(`⚠ ${warning}`);
  if (!fixture) {
    console.error(`✗ Fixture có ${errors.length} lỗi:`);
    for (const error of errors) console.error(`  - ${error}`);
    throw new Error("Fixture không hợp lệ — sửa file rồi chạy lại (hoặc nhờ LLM sửa đúng các dòng trên).");
  }
  return fixture;
}

async function seed(fixture: MatchDemoFixture) {
  const catalog = await loadCatalog();
  const majorId = new Map(catalog.majors.map((m) => [m.name, m.id]));
  const demoPasswordHash = await bcrypt.hash(DEMO_PASSWORD, DEMO_PASSWORD_SALT_ROUNDS);

  // Employer + Company demo (cố định một cặp; định danh bằng email employer).
  const employerUser = await prisma.user.upsert({
    where: { email: DEMO_EMPLOYER_EMAIL },
    update: { passwordHash: demoPasswordHash },
    create: {
      email: DEMO_EMPLOYER_EMAIL,
      role: "EMPLOYER",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      passwordHash: demoPasswordHash,
    },
    include: { employer: true },
  });
  let employer = employerUser.employer;
  if (!employer) {
    const company = await prisma.company.create({
      data: {
        name: DEMO_COMPANY_NAME,
        description: "Công ty giả lập cho bộ đánh giá Job Matcher — không phải doanh nghiệp thật.",
        isVerified: true,
        verificationStatus: "VERIFIED",
        requiresApproval: false,
        verifiedAt: new Date(),
      },
    });
    employer = await prisma.employer.create({
      data: { userId: employerUser.id, companyId: company.id, isCompanyAdmin: true, title: "Nhà tuyển dụng demo" },
    });
  }

  // Kỹ năng bổ sung: APPROVED, đánh dấu người tạo = employer demo để --reset nhận ra.
  let createdSkills = 0;
  for (const name of fixture.extraSkills) {
    const existing = await prisma.skill.findUnique({ where: { name } });
    if (!existing) {
      await prisma.skill.create({ data: { name, status: "APPROVED", createdByUserId: employerUser.id } });
      createdSkills++;
    } else if (existing.status !== "APPROVED") {
      throw new Error(`Kỹ năng "${name}" đã tồn tại ở trạng thái ${existing.status} — xử lý trước rồi chạy lại.`);
    }
  }
  const usedNames = new Set([
    ...fixture.candidates.flatMap((c) => c.skills.map((s) => s.name)),
    ...fixture.jobs.flatMap((j) => j.skills.map((s) => s.name)),
  ]);
  const skillRows = await prisma.skill.findMany({ where: { name: { in: [...usedNames] } }, select: { id: true, name: true } });
  const skillId = new Map(skillRows.map((s) => [s.name, s.id]));
  const idOf = (name: string) => skillId.get(name) ?? fail(`Không tìm thấy skillId của "${name}"`);

  for (const c of fixture.candidates) {
    const email = `${c.ref}@${DEMO_EMAIL_DOMAIN}`;
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash: demoPasswordHash },
      create: { email, role: "CANDIDATE", status: "ACTIVE", emailVerifiedAt: new Date(), passwordHash: demoPasswordHash },
    });
    const candidate = await prisma.candidate.upsert({
      where: { userId: user.id },
      update: { headline: c.headline, bio: c.bio },
      create: { userId: user.id, headline: c.headline, bio: c.bio },
    });
    // Thay toàn bộ phần con thay vì so từng dòng: fixture là nguồn duy nhất.
    await prisma.$transaction([
      prisma.education.deleteMany({ where: { candidateId: candidate.id } }),
      prisma.workExperience.deleteMany({ where: { candidateId: candidate.id } }),
      prisma.project.deleteMany({ where: { candidateId: candidate.id } }),
      prisma.candidateSkill.deleteMany({ where: { candidateId: candidate.id } }),
      prisma.education.createMany({
        data: c.educations.map((e) => ({
          candidateId: candidate.id,
          majorId: majorId.get(e.majorName) ?? fail(`Không tìm thấy ngành "${e.majorName}"`),
          degree: e.degree,
          startYear: e.startYear,
          endYear: e.endYear,
          isCurrent: e.isCurrent,
        })),
      }),
      prisma.workExperience.createMany({
        data: c.workExperiences.map((w) => ({
          candidateId: candidate.id,
          company: w.company,
          position: w.position,
          startDate: parseYearMonth(w.start),
          endDate: w.end ? parseYearMonth(w.end) : null,
          isCurrent: w.isCurrent,
          description: w.description,
        })),
      }),
      prisma.project.createMany({
        data: c.projects.map((p) => ({
          candidateId: candidate.id,
          name: p.name,
          description: p.description,
          startDate: parseYearMonth(p.start),
          endDate: p.end ? parseYearMonth(p.end) : null,
          isWorkingOn: p.end === null,
        })),
      }),
      prisma.candidateSkill.createMany({
        data: c.skills.map((s) => ({ candidateId: candidate.id, skillId: idOf(s.name), yearsOfExperience: s.yearsOfExperience })),
      }),
    ]);
  }

  const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  for (const j of fixture.jobs) {
    const fields = {
      description: j.description,
      requirements: j.requirements,
      minExperienceYears: j.minExperienceYears,
      jobType: "INTERNSHIP" as const,
      status: "PUBLISHED" as const,
      expiresAt,
    };
    const existing = await prisma.jobPost.findFirst({ where: { companyId: employer.companyId, title: j.title }, select: { id: true } });
    const job = existing
      ? await prisma.jobPost.update({ where: { id: existing.id }, data: fields })
      : await prisma.jobPost.create({
          data: { ...fields, title: j.title, companyId: employer.companyId, employerId: employer.id, publishedAt: new Date() },
        });
    await prisma.$transaction([
      prisma.jobPostSkill.deleteMany({ where: { jobPostId: job.id } }),
      prisma.jobPostSkill.createMany({
        data: j.skills.map((s) => ({ jobPostId: job.id, skillId: idOf(s.name), importance: s.importance })),
      }),
    ]);
  }

  // Dữ liệu demo cũ không còn trong fixture → báo, không tự xoá.
  const refs = new Set(fixture.candidates.map((c) => `${c.ref}@${DEMO_EMAIL_DOMAIN}`));
  const stale = (await prisma.user.findMany({ where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` }, role: "CANDIDATE" }, select: { email: true } }))
    .filter((u) => !refs.has(u.email));
  console.log(
    `✓ Seed xong: ${fixture.candidates.length} hồ sơ, ${fixture.jobs.length} tin, ${createdSkills} kỹ năng mới tạo (tổng extraSkills: ${fixture.extraSkills.length}). Đăng nhập thử: email <ref>@${DEMO_EMAIL_DOMAIN} (ứng viên) hoặc ${DEMO_EMPLOYER_EMAIL} (nhà tuyển dụng) + mật khẩu "${DEMO_PASSWORD}".`,
  );
  if (stale.length > 0) console.warn(`⚠ Còn ${stale.length} hồ sơ demo không có trong fixture (chạy --reset rồi seed lại nếu muốn dọn).`);
}

async function reset() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } },
    select: { id: true, role: true },
  });
  if (users.some((u) => u.role === "ADMIN")) throw new Error(`Có tài khoản ADMIN đuôi @${DEMO_EMAIL_DOMAIN} — dừng, không tự xoá.`);
  const employerUser = await prisma.user.findUnique({ where: { email: DEMO_EMPLOYER_EMAIL }, select: { id: true, employer: { select: { companyId: true } } } });
  const companyId = employerUser?.employer?.companyId ?? null;

  const candidateIds = users.filter((u) => u.role === "CANDIDATE").map((u) => u.id);
  const jobs = companyId ? await prisma.jobPost.deleteMany({ where: { companyId } }) : { count: 0 };
  const candidates = await prisma.user.deleteMany({ where: { id: { in: candidateIds } } });

  // Kỹ năng do seed tạo: chỉ xoá khi không còn ai (kể cả dữ liệu thật) dùng — CandidateSkill cascade sẽ xoá liên kết của người thật.
  let skills = { count: 0 };
  let keptSkills = 0;
  if (employerUser) {
    skills = await prisma.skill.deleteMany({
      where: { createdByUserId: employerUser.id, candidateSkills: { none: {} }, jobPostSkills: { none: {} } },
    });
    keptSkills = await prisma.skill.count({ where: { createdByUserId: employerUser.id } });
    await prisma.user.delete({ where: { id: employerUser.id } });
    if (companyId) await prisma.company.deleteMany({ where: { id: companyId, employers: { none: {} }, jobPosts: { none: {} } } });
  }
  console.log(`✓ Đã xoá: ${jobs.count} tin, ${candidates.count} hồ sơ demo, ${skills.count} kỹ năng demo${employerUser ? ", employer + công ty demo" : ""}.`);
  if (keptSkills > 0) console.warn(`⚠ Giữ lại ${keptSkills} kỹ năng demo vì đang được dữ liệu khác dùng.`);
}

async function labelSheet(fixture: MatchDemoFixture) {
  try {
    await fs.access(LABELS_PATH);
    throw new Error(`${LABELS_PATH} đã tồn tại — không ghi đè (công gán nhãn nằm trong đó). Xoá hoặc đổi tên nếu thật sự muốn tạo lại.`);
  } catch (error) {
    if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const pad = String(fixture.pairsToLabel.length).length;
  const sheet = {
    _readme: [
      "label: GOOD_MATCH | PARTIAL_MATCH | POOR_MATCH — nhãn CUỐI CÙNG sau khi hai người thống nhất (null = chưa gán).",
      "ratings: nhãn ĐỘC LẬP của từng người gán trước khi bàn bạc, dùng tính Cohen's κ. Chỉ một người thì xoá rater2 và nêu hạn chế trong báo cáo.",
      "split: theo tin (mọi cặp của một tin cùng tập) — lấy từ fixture, không đổi tay. dev để hiệu chỉnh, test chỉ để báo cáo.",
      "category: kiểu cặp do lúc thiết kế fixture, dùng phân tích lỗi — KHÔNG phải nhãn, đừng để nó dẫn dắt khi gán.",
    ],
    pairs: fixture.pairsToLabel.map((pair, index) => ({
      id: `p${String(index + 1).padStart(pad, "0")}`,
      candidateRef: pair.candidateRef,
      jobRef: pair.jobTitle,
      label: null,
      ratings: { rater1: null, rater2: null },
      split: splitOfPair(fixture, pair.jobTitle),
      category: pair.category,
      note: "",
    })),
  };
  await fs.mkdir(path.dirname(LABELS_PATH), { recursive: true });
  await fs.writeFile(LABELS_PATH, `${JSON.stringify(sheet, null, 2)}\n`, "utf8");
  console.log(`✓ Đã tạo ${LABELS_PATH} với ${sheet.pairs.length} cặp chưa gán nhãn.`);
}

function fail(message: string): never {
  throw new Error(message);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--reset")) return reset();
  const fixture = await loadFixture();
  if (args.has("--check")) {
    console.log(`✓ Fixture hợp lệ: ${fixture.candidates.length} hồ sơ, ${fixture.jobs.length} tin, ${fixture.pairsToLabel.length} cặp, ${fixture.extraSkills.length} kỹ năng bổ sung.`);
    return;
  }
  if (args.has("--label-sheet")) return labelSheet(fixture);
  return seed(fixture);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
