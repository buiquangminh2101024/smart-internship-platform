// Chạy: node --import tsx --test tests/unit/job-post-draft-relations.test.ts (từ apps/server)
// Tạo/sửa tin nháp: id kỹ năng/ngành sai phải trả 400 TRƯỚC khi ghi tin, và tạo tin +
// ghi kỹ năng/ngành nằm chung một transaction (docs/06-backend/major-merge-fix/PLAN.md,
// "Phát hiện thêm"). Prisma giả: chỉ "commit" các thao tác ghi khi callback transaction
// chạy xong không lỗi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JobPostsService } from "../../src/modules/job-posts/job-posts.service";
import { AppError } from "../../src/shared/errors/AppError";

const TX = { tx: true };
const EMPLOYER = { employerId: "emp-1", userId: "user-emp-1", companyId: "co-1" };
const SKILLS = new Set(["sk-node", "sk-react"]);
const APPROVED_MAJORS = new Set(["mj-cntt"]);

function buildService(options: { failSetMajors?: boolean } = {}) {
  const committed: string[] = [];
  let pending: string[] = [];
  const company = { id: "co-1", name: "Công ty A", isVerified: true, requiresApproval: true, verifiedAt: new Date() };
  const jobPost = {
    id: "job-1",
    companyId: "co-1",
    company: { ...company, logoUrl: null, website: null, industryId: null, cityId: null, address: null, taxCode: null, description: null },
    title: "Thực tập sinh Backend",
    description: "Mô tả",
    jobType: "INTERNSHIP",
    status: "DRAFT",
    salaryMin: null,
    salaryMax: null,
    isNegotiable: true,
    requirements: null,
    benefits: null,
    cityId: null,
    city: null,
    address: null,
    industryId: null,
    industry: null,
    publishedAt: null,
    expiresAt: null,
    closedAt: null,
    viewCount: 0,
    minExperienceYears: null,
    requirementsExtra: null,
    requirementsConfirmedAt: null,
    moderationActions: [],
    skills: [],
    majors: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const write = (name: string, db: unknown) => {
    assert.equal(db, TX, `${name} phải chạy trong transaction`);
    pending.push(name);
  };

  const service = new JobPostsService({
    prisma: {
      $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
        pending = [];
        const result = await run(TX);
        committed.push(...pending);
        return result;
      },
    },
    jobPostRepository: {
      findById: async () => jobPost,
      findExistingSkillIds: async (ids: string[]) => new Set(ids.filter((id) => SKILLS.has(id))),
      findExistingMajorIds: async (ids: string[]) => new Set(ids.filter((id) => APPROVED_MAJORS.has(id))),
      create: async (_data: object, db: unknown) => {
        write("create", db);
        return jobPost;
      },
      update: async (_id: string, _data: object, db: unknown) => {
        write("update", db);
        return jobPost;
      },
      setSkills: async (_id: string, _rows: unknown, db: unknown) => write("setSkills", db),
      setMajors: async (_id: string, _rows: unknown, db: unknown) => {
        if (options.failSetMajors) throw new Error("DB lỗi giữa chừng");
        write("setMajors", db);
      },
    },
    employerIdentityCache: { require: async () => EMPLOYER },
    companyRepository: { findById: async () => company },
    subscriptionsService: { getCompanySubscriptionAccess: async () => ({ mode: "SUBSCRIBED", publishRemaining: 5 }) },
  } as unknown as ConstructorParameters<typeof JobPostsService>[0]);
  return { service, committed };
}

const BASE = { title: "Thực tập sinh Backend", description: "Mô tả", jobType: "INTERNSHIP" } as const;

async function assert400(promise: Promise<unknown>, message: string) {
  await assert.rejects(promise, (error: unknown) => error instanceof AppError && error.statusCode === 400 && error.message === message);
}

test("Tạo tin với ngành không tồn tại / chờ duyệt → 400, không tạo tin", async () => {
  const { service, committed } = buildService();
  await assert400(
    service.createDraft(EMPLOYER.userId, { ...BASE, majors: [{ majorId: "mj-pending", relevance: "PRIMARY" }] } as never),
    "One or more majors do not exist",
  );
  assert.deepEqual(committed, []);
});

test("Tạo tin với kỹ năng ưu tiên không tồn tại → 400, không tạo tin", async () => {
  const { service, committed } = buildService();
  await assert400(
    service.createDraft(EMPLOYER.userId, { ...BASE, skillIds: ["sk-node"], preferredSkillIds: ["sk-khong-co"] } as never),
    "One or more skills do not exist",
  );
  assert.deepEqual(committed, []);
});

test("Tạo tin hợp lệ → tạo tin, kỹ năng, ngành trong cùng một transaction", async () => {
  const { service, committed } = buildService();
  await service.createDraft(EMPLOYER.userId, {
    ...BASE,
    // sk-node có ở cả hai danh sách: không được tính là thiếu.
    skillIds: ["sk-node"],
    preferredSkillIds: ["sk-node", "sk-react"],
    majors: [{ majorId: "mj-cntt", relevance: "PRIMARY" }],
  } as never);
  assert.deepEqual(committed, ["create", "setSkills", "setMajors"]);
});

test("Lỗi khi ghi ngành sau khi đã tạo tin → không commit gì (không còn tin nháp mồ côi)", async () => {
  const { service, committed } = buildService({ failSetMajors: true });
  await assert.rejects(
    service.createDraft(EMPLOYER.userId, { ...BASE, majors: [{ majorId: "mj-cntt", relevance: "PRIMARY" }] } as never),
  );
  assert.deepEqual(committed, []);
});

test("Sửa tin với kỹ năng không tồn tại → 400, không sửa trường nào", async () => {
  const { service, committed } = buildService();
  await assert400(
    service.updateDraft(EMPLOYER.userId, "job-1", { title: "Tên mới", skillIds: ["sk-khong-co"] } as never),
    "One or more skills do not exist",
  );
  assert.deepEqual(committed, []);
});

test("Sửa tin không đụng kỹ năng/ngành → chỉ cập nhật tin", async () => {
  const { service, committed } = buildService();
  await service.updateDraft(EMPLOYER.userId, "job-1", { title: "Tên mới" } as never);
  assert.deepEqual(committed, ["update"]);
});
