// Chạy: node --import tsx --test tests/unit/job-posts/job-post-search-viewer.test.ts (từ apps/server)
// GET /job-posts theo người xem (AD-26 D5, docs/06-backend/job-discovery/PLAN.md bước 4):
// khách đi đường cũ + total; ứng viên có `viewer`, `sort=match`, `minMatch`. Repository là
// bản giả — bộ lọc Prisma kiểm trên Neon.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { JobPostSearchQuery } from "@sip/shared-types";
import { AppError } from "../../../src/shared/errors/AppError";
import type { JobPostWithRelations, PublicJobSearchFilter } from "../../../src/modules/job-posts/job-post.repository";
import { JobPostsService } from "../../../src/modules/job-posts/job-posts.service";

const NOW = new Date("2026-11-13T00:00:00Z");

function row(id: string): JobPostWithRelations {
  return {
    id,
    companyId: "co-1",
    company: { id: "co-1", name: "Cty", logoUrl: null, website: null, isVerified: true, industryId: null, cityId: null, address: null, taxCode: null, description: null },
    title: id,
    description: "",
    jobType: "INTERNSHIP",
    status: "PUBLISHED",
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
    publishedAt: NOW,
    expiresAt: null,
    closedAt: null,
    viewCount: 0,
    minExperienceYears: null,
    skills: [],
    majors: [],
    requirementsExtra: null,
    requirementsConfirmedAt: null,
    moderationActions: [],
    _count: { applications: 0 },
    createdAt: NOW,
    updatedAt: NOW,
  } as unknown as JobPostWithRelations;
}

/** Tin "mới đăng trước": j1 mới nhất … j25 cũ nhất. */
const IDS = Array.from({ length: 25 }, (_, index) => `j${index + 1}`);

function setup(options: { scores?: Record<string, number>; hasCandidate?: boolean } = {}) {
  const scores = new Map(Object.entries(options.scores ?? {}));
  const calls = { newest: [] as unknown[], ids: [] as PublicJobSearchFilter[], candidateLookups: 0, scoreLookups: [] as string[][] };
  const jobPostRepository = {
    findPublishedForSearch: async (filter: PublicJobSearchFilter, cursor: string | undefined) => {
      calls.newest.push({ filter, cursor });
      return { items: IDS.slice(0, 20).map(row), hasMore: true, nextCursor: "j20", total: 25 };
    },
    findPublishedIdsForSearch: async (filter: PublicJobSearchFilter) => {
      calls.ids.push(filter);
      return IDS;
    },
    findManyWithRelationsByIds: async (ids: string[]) => ids.map(row),
    findViewerState: async (_candidateId: string, ids: string[]) => ({
      saved: new Set(ids.filter((id) => id === "j2")),
      applied: new Set(ids.filter((id) => id === "j3")),
    }),
  };
  const matchScoreRepository = {
    scoresForCandidate: async (_candidateId: string, ids: string[]) => {
      calls.scoreLookups.push(ids);
      return new Map(ids.flatMap((id) => (scores.has(id) ? [[id, scores.get(id)!] as const] : [])));
    },
  };
  const prisma = {
    candidate: {
      findUnique: async () => {
        calls.candidateLookups++;
        return options.hasCandidate === false ? null : { id: "c1" };
      },
    },
  };
  const service = new JobPostsService({
    prisma,
    jobPostRepository,
    matchScoreRepository,
  } as unknown as ConstructorParameters<typeof JobPostsService>[0]);
  return { service, calls };
}

const query = (extra: Partial<JobPostSearchQuery> = {}): JobPostSearchQuery => ({
  skillMode: "any",
  sort: "newest",
  ...extra,
});

test("khách: đường cũ (cursor theo id), có total, không viewer, không tra ứng viên", async () => {
  const { service, calls } = setup();
  const result = await service.search(query({ q: "react", cursor: "j5" }));
  assert.deepEqual(calls.newest, [{ filter: { q: "react", skillMode: "any" }, cursor: "j5" }]);
  assert.equal(result.total, 25);
  assert.equal(result.nextCursor, "j20");
  assert.ok(result.items.every((item) => item.viewer === undefined));
  assert.equal(calls.candidateLookups, 0);
});

test("khách gửi sort=match / minMatch ⇒ bỏ qua, vẫn đường cũ", async () => {
  const { service, calls } = setup();
  await service.search(query({ sort: "match", minMatch: 70 }));
  assert.equal(calls.newest.length, 1);
  assert.equal(calls.ids.length, 0);
});

test("ứng viên, sort=newest: đường cũ kèm viewer cho đúng tin của trang", async () => {
  const { service, calls } = setup({ scores: { j1: 88, j3: 40 } });
  const result = await service.search(query(), "user-1");
  const byId = new Map(result.items.map((item) => [item.id, item.viewer]));
  assert.deepEqual(byId.get("j1"), { matchScore: 88, saved: false, applied: false });
  assert.deepEqual(byId.get("j2"), { matchScore: null, saved: true, applied: false });
  assert.deepEqual(byId.get("j3"), { matchScore: 40, saved: false, applied: true });
  assert.deepEqual(calls.scoreLookups, [IDS.slice(0, 20)]);
  assert.equal(result.total, 25);
});

test("ứng viên, sort=match: điểm cao trước, tin chưa có điểm xếp cuối, hoà giữ thứ tự mới đăng", async () => {
  const { service } = setup({ scores: { j10: 90, j4: 75, j20: 75, j1: 30 } });
  const result = await service.search(query({ sort: "match" }), "user-1");
  const ids = result.items.map((item) => item.id);
  assert.deepEqual(ids.slice(0, 5), ["j10", "j4", "j20", "j1", "j2"]);
  assert.equal(result.items.length, 20);
  assert.equal(result.total, 25);
  assert.equal(result.hasMore, true);
  assert.equal(result.nextCursor, "20");
  assert.equal(result.items[0]!.viewer!.matchScore, 90);
});

test("ứng viên, sort=match: trang sau theo offset, trang cuối không nextCursor", async () => {
  const { service } = setup({ scores: { j10: 90 } });
  const result = await service.search(query({ sort: "match", cursor: "20" }), "user-1");
  assert.equal(result.items.length, 5);
  assert.equal(result.hasMore, false);
  assert.equal(result.nextCursor, undefined);
});

test("ứng viên, minMatch=70 không sort=match: chỉ tin ≥ 70, giữ thứ tự mới đăng", async () => {
  const { service, calls } = setup({ scores: { j10: 90, j4: 70, j20: 69, j1: 85 } });
  const result = await service.search(query({ minMatch: 70 }), "user-1");
  assert.deepEqual(
    result.items.map((item) => item.id),
    ["j1", "j4", "j10"],
  );
  assert.equal(result.total, 3);
  assert.equal(result.hasMore, false);
  assert.deepEqual(calls.ids, [{ skillMode: "any" }]);
});

test("ứng viên, sort=match với cursor theo id (cũ) ⇒ 400 INVALID_CURSOR", async () => {
  const { service } = setup();
  await assert.rejects(
    () => service.search(query({ sort: "match", cursor: "cjld2cjxh0000qzrmn831i7rn" }), "user-1"),
    (error: unknown) => error instanceof AppError && error.statusCode === 400 && error.code === "INVALID_CURSOR",
  );
});

test("tài khoản ứng viên chưa có hồ sơ ⇒ như khách", async () => {
  const { service, calls } = setup({ hasCandidate: false });
  const result = await service.search(query({ sort: "match" }), "user-1");
  assert.equal(calls.newest.length, 1);
  assert.ok(result.items.every((item) => item.viewer === undefined));
});
