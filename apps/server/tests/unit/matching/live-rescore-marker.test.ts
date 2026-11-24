// Chạy: node --import tsx --test tests/unit/matching/live-rescore-marker.test.ts (từ apps/server)
// Bước 2 của chấm lại theo ứng viên (docs/06-backend/live-rescore/PLAN.md, AD-27 mục 1, 3):
// hẹn giờ chờ ngừng sửa (sửa liên tiếp chỉ ra một lượt, trần số hẹn giờ), CandidateRescoreMarker
// (lỗi không lan ra, danh mục: lấy người trước khi đổi, đánh dấu sau khi đổi), mọi lối ghi của
// CandidateService / nhập CV / danh mục / cron gộp có đánh dấu, bật cho liên hệ mở lại tự mời.
// Repository và Prisma là bản giả.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { CandidateRescoreMarker } from "../../../src/modules/live-rescore/candidate-rescore-marker";
import type { LiveRescoreRepository } from "../../../src/modules/live-rescore/live-rescore.repository";
import { LiveRescoreScheduler } from "../../../src/modules/live-rescore/live-rescore.scheduler";
import { CandidateService } from "../../../src/modules/candidates/candidate.service";
import { SkillsService } from "../../../src/modules/skills/skills.service";
import { EducationCatalogService } from "../../../src/modules/education-catalog/education-catalog.service";
import { runCatalogSuggestionQueue, type CatalogQueueDeps } from "../../../src/modules/shared/catalog-suggestion-queue.job";
import { CandidateOutreachService } from "../../../src/modules/candidate-outreach/candidate-outreach.service";
import type { Logger } from "../../../src/shared/logger";

const DEBOUNCE_MS = 25;

function quietLogger() {
  const errors: string[] = [];
  const warns: string[] = [];
  const logger = {
    info: () => {},
    warn: (message: string) => warns.push(message),
    error: (message: string) => errors.push(message),
  } as unknown as Logger;
  return { logger, errors, warns };
}

// ─── Hẹn giờ ─────────────────────────────────────────────────────────────────

function buildScheduler(maxTimers = 100, onDrain: () => void = () => {}) {
  const { logger, errors, warns } = quietLogger();
  let drains = 0;
  const scheduler = new LiveRescoreScheduler({
    liveRescoreDrainRequester: () => {
      drains += 1;
      onDrain();
    },
    logger,
    liveRescoreSchedulerOptions: { debounceMs: DEBOUNCE_MS, maxTimers },
  });
  return { scheduler, drains: () => drains, errors, warns };
}

test("sửa liên tiếp cùng một ứng viên chỉ ra một yêu cầu chấm, sau khi ngừng sửa", async () => {
  const { scheduler, drains } = buildScheduler();
  scheduler.touch("c1");
  await sleep(DEBOUNCE_MS / 2);
  scheduler.touch("c1");
  await sleep(DEBOUNCE_MS / 2);
  scheduler.touch("c1");
  assert.equal(drains(), 0, "còn đang sửa thì chưa chấm");
  assert.equal(scheduler.pendingCount, 1);

  await sleep(DEBOUNCE_MS * 3);
  assert.equal(drains(), 1);
  assert.equal(scheduler.pendingCount, 0);
});

test("hai ứng viên có hai hẹn giờ riêng", async () => {
  const { scheduler, drains } = buildScheduler();
  scheduler.touch("c1");
  scheduler.touch("c2");
  assert.equal(scheduler.pendingCount, 2);
  await sleep(DEBOUNCE_MS * 3);
  assert.equal(drains(), 2);
});

test("quá trần hẹn giờ: người mới không có hẹn giờ (chờ cron), người đang chờ vẫn dời được", async () => {
  const { scheduler, drains, warns } = buildScheduler(1);
  scheduler.touch("c1");
  scheduler.touch("c2");
  scheduler.touch("c3");
  scheduler.touch("c1");
  assert.equal(scheduler.pendingCount, 1);
  assert.equal(warns.length, 1, "cảnh báo một lần mỗi đợt tràn");
  await sleep(DEBOUNCE_MS * 3);
  assert.equal(drains(), 1);
});

test("yêu cầu chấm ném lỗi thì chỉ ghi log; clear huỷ mọi hẹn giờ", async () => {
  const { scheduler, errors, drains } = buildScheduler(100, () => {
    throw new Error("boom");
  });
  scheduler.touch("c1");
  await sleep(DEBOUNCE_MS * 3);
  assert.equal(drains(), 1);
  assert.equal(errors.length, 1);

  scheduler.touch("c2");
  scheduler.clear();
  await sleep(DEBOUNCE_MS * 3);
  assert.equal(drains(), 1);
  assert.equal(scheduler.pendingCount, 0);
});

// ─── CandidateRescoreMarker ─────────────────────────────────────────────────

interface FakeRepoOptions {
  failMark?: boolean;
  failFind?: boolean;
  skillHolders?: string[];
  majorHolders?: string[];
  /** Tin đang hiển thị gắn mục đó (Q1). */
  skillJobs?: string[];
  majorJobs?: string[];
  failFindJobs?: boolean;
  failQueue?: boolean;
}

function buildMarker(options: FakeRepoOptions = {}) {
  const { logger, errors } = quietLogger();
  const log: string[] = [];
  const marked: string[][] = [];
  const touched: string[] = [];
  const queued: string[][] = [];
  let drains = 0;
  const repository = {
    markCandidates: async (ids: string[]) => {
      log.push("mark");
      if (options.failMark) throw new Error("db down");
      marked.push(ids);
      return ids.length;
    },
    findCandidateIdsBySkills: async () => {
      log.push("find");
      if (options.failFind) throw new Error("db down");
      return options.skillHolders ?? [];
    },
    findCandidateIdsByMajors: async () => {
      log.push("find");
      if (options.failFind) throw new Error("db down");
      return options.majorHolders ?? [];
    },
    findVisibleJobIdsBySkills: async () => {
      log.push("find-jobs");
      if (options.failFindJobs) throw new Error("db down");
      return options.skillJobs ?? [];
    },
    findVisibleJobIdsByMajors: async () => {
      log.push("find-jobs");
      if (options.failFindJobs) throw new Error("db down");
      return options.majorJobs ?? [];
    },
  } as unknown as LiveRescoreRepository;
  const scheduler = { touch: (id: string) => touched.push(id) } as unknown as LiveRescoreScheduler;
  const jobProfileCache = {
    getMany: async () => new Map(),
    invalidate: () => {},
    clear: () => log.push("clear-job-cache"),
  };
  const marker = new CandidateRescoreMarker({
    liveRescoreRepository: repository,
    liveRescoreScheduler: scheduler,
    liveRescoreDrainRequester: () => {
      drains += 1;
    },
    liveRescoreJobRequester: (jobPostIds: string[]) => {
      log.push("queue");
      if (options.failQueue) throw new Error("boom");
      queued.push(jobPostIds);
    },
    jobProfileCache,
    logger,
  });
  return { marker, log, marked, touched, queued, drains: () => drains, errors };
}

test("mark: một câu đánh dấu rồi đặt hẹn giờ", async () => {
  const { marker, marked, touched } = buildMarker();
  await marker.mark("c1");
  assert.deepEqual(marked, [["c1"]]);
  assert.deepEqual(touched, ["c1"]);
});

test("mark: DB lỗi thì không ném, không hẹn giờ, ghi log", async () => {
  const { marker, touched, errors } = buildMarker({ failMark: true });
  await marker.mark("c1");
  assert.deepEqual(touched, []);
  assert.equal(errors.length, 1);
});

test("markSkillHolders: lấy người trước khi đổi, đánh dấu sau khi đổi, yêu cầu một lượt chấm", async () => {
  const { marker, log, marked, touched, drains } = buildMarker({ skillHolders: ["c1", "c2"] });
  const result = await marker.markSkillHolders(["s1"], async () => {
    log.push("change");
    return 42;
  });
  assert.equal(result, 42);
  assert.deepEqual(log, ["find", "find-jobs", "change", "clear-job-cache", "mark"], "xoá cache hồ sơ tin sau khi đổi");
  assert.deepEqual(marked, [["c1", "c2"]]);
  assert.deepEqual(touched, [], "danh mục đổi không hẹn giờ cho từng người");
  assert.equal(drains(), 1);
});

test("markSkillHolders: thao tác lỗi thì ném lại nguyên lỗi, không đánh dấu", async () => {
  const { marker, marked, drains } = buildMarker({ skillHolders: ["c1"] });
  await assert.rejects(
    marker.markSkillHolders(["s1"], async () => {
      throw new Error("conflict");
    }),
    /conflict/,
  );
  assert.deepEqual(marked, []);
  assert.equal(drains(), 0);
});

test("markSkillHolders: lấy người lỗi thì thao tác vẫn chạy; đánh dấu lỗi không làm hỏng thao tác", async () => {
  const findFails = buildMarker({ failFind: true, skillHolders: ["c1"] });
  let changed = false;
  await findFails.marker.markSkillHolders(["s1"], async () => {
    changed = true;
  });
  assert.equal(changed, true);
  assert.deepEqual(findFails.marked, []);
  assert.equal(findFails.errors.length, 1);

  const markFails = buildMarker({ failMark: true, skillHolders: ["c1"] });
  assert.equal(await markFails.marker.markSkillHolders(["s1"], async () => "ok"), "ok");
  assert.equal(markFails.errors.length, 1);
  assert.equal(markFails.drains(), 0);
});

test("markMajorHolders: không ai có ngành thì không ghi, không yêu cầu chấm (vẫn xoá cache hồ sơ tin)", async () => {
  const { marker, log, drains } = buildMarker({ majorHolders: [] });
  await marker.markMajorHolders(["m1"], async () => undefined);
  assert.deepEqual(log, ["find", "find-jobs", "clear-job-cache"], "tin gắn ngành vẫn đổi yêu cầu dù không ứng viên nào có ngành");
  assert.equal(drains(), 0);
});

// ─── Q1 (bước 5): tin gắn mục đó vào hàng chờ chấm lại theo tin ─────────────

test("markSkillHolders (Q1): lấy tin trước khi đổi, xếp hàng sau khi đổi và trước khi đánh dấu người", async () => {
  const { marker, log, queued, marked, drains } = buildMarker({ skillHolders: ["c1"], skillJobs: ["j1", "j2"] });
  await marker.markSkillHolders(["s1"], async () => {
    log.push("change");
  });
  assert.deepEqual(log, ["find", "find-jobs", "change", "clear-job-cache", "queue", "mark"]);
  assert.deepEqual(queued, [["j1", "j2"]]);
  assert.deepEqual(marked, [["c1"]]);
  assert.equal(drains(), 1);
});

test("markMajorHolders (Q1): không ai có ngành nhưng có tin gắn ngành ⇒ vẫn xếp tin (requester tự yêu cầu lượt)", async () => {
  const { marker, queued, marked, drains } = buildMarker({ majorHolders: [], majorJobs: ["j9"] });
  await marker.markMajorHolders(["m1"], async () => undefined);
  assert.deepEqual(queued, [["j9"]]);
  assert.deepEqual(marked, []);
  assert.equal(drains(), 0, "marker không gọi drain riêng; requestJobRescore đã yêu cầu lượt");
});

test("Q1: lấy tin lỗi hay xếp hàng lỗi chỉ ghi log, thao tác và đánh dấu người vẫn chạy; thao tác lỗi thì không xếp", async () => {
  const findFails = buildMarker({ skillHolders: ["c1"], skillJobs: ["j1"], failFindJobs: true });
  assert.equal(await findFails.marker.markSkillHolders(["s1"], async () => "ok"), "ok");
  assert.deepEqual(findFails.queued, []);
  assert.deepEqual(findFails.marked, [["c1"]]);
  assert.equal(findFails.errors.length, 1);

  const queueFails = buildMarker({ skillHolders: ["c1"], skillJobs: ["j1"], failQueue: true });
  assert.equal(await queueFails.marker.markSkillHolders(["s1"], async () => "ok"), "ok");
  assert.deepEqual(queueFails.marked, [["c1"]]);
  assert.equal(queueFails.errors.length, 1);

  const changeFails = buildMarker({ skillHolders: ["c1"], skillJobs: ["j1"] });
  await assert.rejects(
    changeFails.marker.markSkillHolders(["s1"], async () => {
      throw new Error("conflict");
    }),
    /conflict/,
  );
  assert.deepEqual(changeFails.queued, []);
});

// ─── CandidateService: mọi lối ghi bộ chấm đọc ──────────────────────────────

/** Marker giả ghi lại lời gọi; `failing` mô phỏng marker thật nuốt lỗi (không ném). */
function recordingMarker() {
  const calls: string[] = [];
  const marker = {
    mark: async (candidateId: string) => {
      calls.push(`mark:${candidateId}`);
    },
    markSkillHolders: async <T>(ids: string[], change: () => Promise<T>) => {
      calls.push(`skill:${ids.join(",")}:before`);
      const result = await change();
      calls.push(`skill:${ids.join(",")}:after`);
      return result;
    },
    markMajorHolders: async <T>(ids: string[], change: () => Promise<T>) => {
      calls.push(`major:${ids.join(",")}:before`);
      const result = await change();
      calls.push(`major:${ids.join(",")}:after`);
      return result;
    },
  } as unknown as CandidateRescoreMarker;
  return { marker, calls };
}

function buildCandidateService(marker: CandidateRescoreMarker, calls: string[]) {
  const write = (name: string) => async () => {
    calls.push(name);
    return { id: `${name}-row`, isCurrent: false };
  };
  const candidateRepository = {
    ensureCandidate: async () => ({ id: "cand-1", userId: "user-1" }),
    getEducationById: async () => ({ id: "edu-1" }),
    clearCurrentEducationExcept: async () => {},
    createEducation: write("write:createEducation"),
    updateEducation: write("write:updateEducation"),
    deleteEducation: write("write:deleteEducation"),
    upsertSkill: write("write:upsertSkill"),
    removeSkill: write("write:removeSkill"),
    createWorkExperience: write("write:createWorkExperience"),
    updateWorkExperience: write("write:updateWorkExperience"),
    deleteWorkExperience: write("write:deleteWorkExperience"),
    createProject: write("write:createProject"),
    updateProject: write("write:updateProject"),
    deleteProject: write("write:deleteProject"),
    createCertificate: write("write:createCertificate"),
    createAward: write("write:createAward"),
  };
  const prisma = {
    candidate: { update: write("write:updateProfile") },
    education: { findUnique: async () => ({ id: "edu-1" }) },
    candidateSkill: { findUnique: async () => ({ skillId: "s1" }) },
  };
  return new CandidateService({
    candidateRepository: candidateRepository as never,
    prisma: prisma as never,
    mediaStorage: {} as never,
    candidateRescoreMarker: marker,
  });
}

test("CandidateService: mọi lối ghi bộ chấm đọc đều đánh dấu, sau khi ghi", async () => {
  const cases: Array<[string, (service: CandidateService) => Promise<unknown>]> = [
    ["createEducation", (s) => s.createEducation("user-1", { majorId: "m1", isCurrent: true })],
    ["updateEducation", (s) => s.updateEducation("user-1", "edu-1", { degree: "Cử nhân" })],
    ["deleteEducation", (s) => s.deleteEducation("user-1", "edu-1")],
    ["upsertSkill", (s) => s.upsertSkill("user-1", "s1", 2)],
    ["removeSkill", (s) => s.removeSkill("user-1", "s1")],
    ["createWorkExperience", (s) => s.createWorkExperience("user-1", { company: "A", position: "Dev" })],
    ["updateWorkExperience", (s) => s.updateWorkExperience("user-1", "w1", { position: "Dev" })],
    ["deleteWorkExperience", (s) => s.deleteWorkExperience("user-1", "w1")],
    ["createProject", (s) => s.createProject("user-1", { name: "P" })],
    ["updateProject", (s) => s.updateProject("user-1", "p1", { name: "P" })],
    ["deleteProject", (s) => s.deleteProject("user-1", "p1")],
    ["updateProfile", (s) => s.updateProfile("user-1", { headline: "Thực tập sinh Backend" })],
  ];
  for (const [name, run] of cases) {
    const { marker, calls } = recordingMarker();
    await run(buildCandidateService(marker, calls));
    assert.deepEqual(calls, [`write:${name}`, "mark:cand-1"], name);
  }
});

test("CandidateService: trả đúng bản ghi vừa ghi (không đổi response vì đánh dấu)", async () => {
  const { marker, calls } = recordingMarker();
  const service = buildCandidateService(marker, calls);
  assert.deepEqual(await service.createWorkExperience("user-1", { company: "A", position: "Dev" }), {
    id: "write:createWorkExperience-row",
    isCurrent: false,
  });
  assert.deepEqual(await service.updateProject("user-1", "p1", { name: "P" }), {
    id: "write:updateProject-row",
    isCurrent: false,
  });
});

test("CandidateService: dữ liệu bộ chấm không đọc thì không đánh dấu", async () => {
  const { marker, calls } = recordingMarker();
  const service = buildCandidateService(marker, calls);
  await service.updateProfile("user-1", { phone: "0900000000", cityId: "hn", avatarUrl: "x" });
  await service.createCertificate("user-1", { name: "IELTS" });
  await service.createAward("user-1", { title: "Giải nhất" });
  assert.ok(!calls.some((call) => call.startsWith("mark:")), calls.join(" "));
});

test("CandidateService: đánh dấu lỗi không làm hỏng request lưu hồ sơ", async () => {
  const failing = buildMarker({ failMark: true });
  const calls: string[] = [];
  const service = buildCandidateService(failing.marker, calls);
  await service.upsertSkill("user-1", "s1", 1);
  assert.deepEqual(calls, ["write:upsertSkill"]);
  assert.equal(failing.errors.length, 1);
});

// ─── Danh mục ───────────────────────────────────────────────────────────────

test("SkillsService: duyệt / từ chối / gộp đều đánh dấu người có kỹ năng nguồn quanh thao tác", async () => {
  const run = async (action: (service: SkillsService) => Promise<unknown>) => {
    const { marker, calls } = recordingMarker();
    const skillsRepository = {
      findById: async (id: string) =>
        id === "target" ? { id, name: "Excel", status: "APPROVED" } : { id, name: "Exel", status: "PENDING" },
      approve: async () => calls.push("approve"),
      reject: async () => calls.push("reject"),
      merge: async () => calls.push("merge"),
      findAdminRow: async (id: string) => ({
        id,
        name: "Exel",
        status: "APPROVED",
        createdBy: null,
        pendingMatchSkill: null,
        _count: { candidateSkills: 0, jobPostSkills: 0 },
        createdAt: new Date(),
      }),
    };
    const service = new SkillsService({
      skillsRepository: skillsRepository as never,
      skillDedupeService: {} as never,
      auditLogService: { record: async () => {} } as never,
      candidateRescoreMarker: marker,
    });
    await action(service);
    return calls;
  };

  assert.deepEqual(await run((s) => s.approve("admin", "src")), ["skill:src:before", "approve", "skill:src:after"]);
  assert.deepEqual(await run((s) => s.reject("admin", "src")), ["skill:src:before", "reject", "skill:src:after"]);
  assert.deepEqual(await run((s) => s.merge("admin", "src", "target")), ["skill:src:before", "merge", "skill:src:after"]);
});

test("EducationCatalogService: chỉ miền ngành đánh dấu; duyệt ngành không đánh dấu", async () => {
  const run = async (action: (service: EducationCatalogService) => Promise<unknown>) => {
    const { marker, calls } = recordingMarker();
    const repository = (domain: string) => ({
      findById: async (id: string) => ({ id, name: "Tên", status: id === "target" ? "APPROVED" : "PENDING" }),
      findByNameInsensitive: async () => null,
      approve: async () => calls.push(`${domain}:approve`),
      renameApprove: async () => calls.push(`${domain}:renameApprove`),
      reject: async () => calls.push(`${domain}:reject`),
      merge: async () => calls.push(`${domain}:merge`),
      findAdminRow: async (id: string) => ({
        id,
        name: "Tên",
        code: null,
        status: "APPROVED",
        createdByEmail: null,
        pendingMatch: null,
        usageCount: 0,
        createdAt: new Date(),
      }),
    });
    const service = new EducationCatalogService({
      universityRepository: repository("university") as never,
      majorRepository: repository("major") as never,
      universityDedupeService: {} as never,
      majorDedupeService: {} as never,
      auditLogService: { record: async () => {} } as never,
      candidateRescoreMarker: marker,
    });
    await action(service);
    return calls;
  };

  assert.deepEqual(await run((s) => s.approve("admin", "major", "src")), ["major:approve"]);
  assert.deepEqual(await run((s) => s.renameApprove("admin", "major", "src", "Khoa học máy tính")), [
    "major:src:before",
    "major:renameApprove",
    "major:src:after",
  ]);
  assert.deepEqual(await run((s) => s.reject("admin", "major", "src")), ["major:src:before", "major:reject", "major:src:after"]);
  assert.deepEqual(await run((s) => s.merge("admin", "major", "src", "target")), [
    "major:src:before",
    "major:merge",
    "major:src:after",
  ]);
  assert.deepEqual(await run((s) => s.merge("admin", "university", "src", "target")), ["university:merge"]);
  assert.deepEqual(await run((s) => s.reject("admin", "university", "src")), ["university:reject"]);
});

test("cron gộp danh mục (LLM): gộp kỹ năng / ngành đánh dấu người có mục nguồn, gộp trường thì không", async () => {
  const { marker, calls } = recordingMarker();
  const queue = (domain: string) => ({
    findPendingVerification: async () => [{ id: `${domain}-src`, name: "x", pendingMatch: { id: `${domain}-dst`, name: "y" } }],
    merge: async () => calls.push(`${domain}:merge`),
    clearPendingMatch: async () => {},
  });
  const skillsRepository = {
    ...queue("skill"),
    findPendingVerification: async () => [{ id: "skill-src", name: "x", pendingMatchSkill: { id: "skill-dst", name: "y" } }],
  };
  const deps = {
    skillsRepository,
    skillEmbeddingService: { findWithoutEmbedding: async () => [] },
    universityRepository: queue("university"),
    majorRepository: queue("major"),
    catalogMatchVerifier: { verify: async (_d: string, _n: string, c: Array<{ id: string }>) => ({ decision: "MATCH", matchedId: c[0]!.id }) },
    candidateRescoreMarker: marker,
    logger: quietLogger().logger,
  } as unknown as CatalogQueueDeps;

  await runCatalogSuggestionQueue(deps);
  assert.deepEqual(calls, [
    "skill:skill-src:before",
    "skill:merge",
    "skill:skill-src:after",
    "university:merge",
    "major:major-src:before",
    "major:merge",
    "major:major-src:after",
  ]);
});

// ─── Bật cho liên hệ ─────────────────────────────────────────────────────────

function buildOutreachService(options: { cleared?: string[]; fail?: boolean } = {}) {
  const { logger, errors } = quietLogger();
  const triggered: string[] = [];
  let clearCalls = 0;
  const service = new CandidateOutreachService({
    candidateOutreachRepository: {
      findCandidateIdByUserId: async () => "cand-1",
      updateOpenToOutreach: async (_id: string, value: boolean) => value,
    },
    autoOutreachRepository: {
      clearExhaustedForCandidate: async () => {
        clearCalls += 1;
        if (options.fail) throw new Error("db down");
        return options.cleared ?? [];
      },
    },
    autoOutreachTrigger: (companyId: string) => triggered.push(companyId),
    logger,
    config: { JOB_MATCHER_MODE: "hybrid" },
  } as unknown as ConstructorParameters<typeof CandidateOutreachService>[0]);
  return { service, triggered, clearCalls: () => clearCalls, errors };
}

test("bật cho liên hệ: xoá dấu hết ứng viên của tin có chung kỹ năng, kích hoạt tự mời từng công ty", async () => {
  const { service, triggered } = buildOutreachService({ cleared: ["co-1", "co-2"] });
  assert.deepEqual(await service.updateSettings("user-1", { isOpenToOutreach: true }), { isOpenToOutreach: true });
  assert.deepEqual(triggered, ["co-1", "co-2"]);
});

test("tắt cho liên hệ: không đụng tự mời; lỗi khi mở lại tự mời không làm hỏng cài đặt", async () => {
  const off = buildOutreachService({ cleared: ["co-1"] });
  await off.service.updateSettings("user-1", { isOpenToOutreach: false });
  assert.equal(off.clearCalls(), 0);
  assert.deepEqual(off.triggered, []);

  const failing = buildOutreachService({ fail: true });
  assert.deepEqual(await failing.service.updateSettings("user-1", { isOpenToOutreach: true }), { isOpenToOutreach: true });
  assert.equal(failing.errors.length, 1);
});
