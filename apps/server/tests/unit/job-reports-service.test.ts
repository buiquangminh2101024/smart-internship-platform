import { test } from "node:test";
import assert from "node:assert/strict";
import { JobReportsService } from "../../src/modules/job-reports/job-reports.service";
import { AppError } from "../../src/shared/errors/AppError";

function buildTestContext() {
  const auditLogs: any[] = [];
  const retractedJobs: any[] = [];
  const suspendedUsers: any[] = [];

  const mockJob = {
    id: "job-1",
    title: "Tuyển Thực tập sinh Backend",
    status: "PUBLISHED",
    companyId: "comp-1",
    company: { id: "comp-1", name: "Công ty ABC" },
    employer: { id: "emp-1", userId: "user-emp-1" },
  };

  const reports = new Map<string, any>();

  const jobPostRepository = {
    findById: async (id: string) => (id === mockJob.id ? mockJob : null),
  };

  const jobReportRepository = {
    create: async (data: any) => {
      const item = {
        id: `report-${Date.now()}`,
        jobId: data.jobId,
        reporterId: data.reporterId,
        reason: data.reason,
        description: data.description,
        status: "PENDING",
        resolution: null,
        adminNote: null,
        resolvedAt: null,
        resolvedById: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      reports.set(item.id, item);
      return item;
    },
    findPendingByJobAndReporter: async (jobId: string, reporterId: string) => {
      for (const rep of reports.values()) {
        if (rep.jobId === jobId && rep.reporterId === reporterId && rep.status === "PENDING") {
          return rep;
        }
      }
      return null;
    },
    findById: async (id: string) => {
      const rep = reports.get(id);
      if (!rep) return null;
      return {
        ...rep,
        job: mockJob,
        reporter: {
          id: rep.reporterId,
          email: "candidate@example.com",
          candidate: { fullName: "Nguyễn Văn A" },
        },
      };
    },
    update: async (id: string, data: any) => {
      const rep = reports.get(id);
      if (!rep) throw new Error("Report not found");
      const updated = { ...rep, ...data, updatedAt: new Date() };
      reports.set(id, updated);
      return updated;
    },
    findManyWithPagination: async () => ({
      items: Array.from(reports.values()).map((rep) => ({
        ...rep,
        job: mockJob,
        reporter: {
          id: rep.reporterId,
          email: "candidate@example.com",
          candidate: { fullName: "Nguyễn Văn A" },
        },
      })),
      total: reports.size,
      page: 1,
      limit: 20,
      totalPages: 1,
    }),
    countStats: async () => ({ pending: 1, resolved: 0, takeDownCount: 0, dismissCount: 0, total: 1 }),
  };

  const jobPostsService = {
    retract: async (actorId: string, id: string, reason: string) => {
      retractedJobs.push({ actorId, id, reason });
      mockJob.status = "TAKEN_DOWN";
      return mockJob;
    },
  };

  const usersService = {
    suspend: async (adminId: string, userId: string, reason: string) => {
      suspendedUsers.push({ adminId, userId, reason });
      return {};
    },
  };

  const auditLogService = {
    record: async (entry: any) => {
      auditLogs.push(entry);
    },
  };

  const mediaStorage = {
    upload: async () => ({ url: "https://res.cloudinary.com/demo/image.png" }),
  };

  const prisma = {
    $transaction: async (cb: any) => cb({}),
  };

  const logger = {
    warn: () => {},
    error: () => {},
    info: () => {},
  };

  const service = new JobReportsService({
    jobPostsService: jobPostsService as any,
    jobReportRepository: jobReportRepository as any,
    jobPostRepository: jobPostRepository as any,
    auditLogService: auditLogService as any,
    mediaStorage: mediaStorage as any,
    prisma: prisma as any,
    logger: logger as any,
  });

  return {
    service,
    reports,
    mockJob,
    auditLogs,
    retractedJobs,
    suspendedUsers,
  };
}

test("createReport: ném 404 khi tin tuyển dụng không tồn tại", async () => {
  const { service } = buildTestContext();
  await assert.rejects(
    async () => {
      await service.createReport("user-cand-1", "non-existent-job", {
        reason: "SCAM",
        description: "Lừa đảo",
      });
    },
    (err: unknown) => {
      assert(err instanceof AppError);
      assert.equal(err.statusCode, 404);
      assert.equal(err.code, "JOB_NOT_FOUND");
      return true;
    },
  );
});

test("createReport: ném 400 khi đã có báo cáo PENDING cho tin này", async () => {
  const { service } = buildTestContext();
  await service.createReport("user-cand-1", "job-1", {
    reason: "SCAM",
    description: "Lừa đảo thu tiền",
  });

  await assert.rejects(
    async () => {
      await service.createReport("user-cand-1", "job-1", {
        reason: "CHARGING_FEE",
        description: "Thu phí phỏng vấn",
      });
    },
    (err: unknown) => {
      assert(err instanceof AppError);
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, "REPORT_PENDING_EXISTS");
      return true;
    },
  );
});

test("checkUserReport: kiểm tra chính xác trạng thái báo cáo đang chờ", async () => {
  const { service } = buildTestContext();
  const before = await service.checkUserReport("user-cand-1", "job-1");
  assert.equal(before.hasPendingReport, false);

  const report = await service.createReport("user-cand-1", "job-1", {
    reason: "INAPPROPRIATE",
    description: "Nội dung phản cảm",
  });

  const after = await service.checkUserReport("user-cand-1", "job-1");
  assert.equal(after.hasPendingReport, true);
  assert.equal(after.reportId, report.id);
});

test("executeAction: Admin chọn TAKE_DOWN thì gỡ tin, set RESOLVED và resolution = TAKE_DOWN", async () => {
  const { service, retractedJobs, mockJob } = buildTestContext();
  mockJob.status = "PUBLISHED";

  const created = await service.createReport("user-cand-1", "job-1", {
    reason: "SCAM",
    description: "Đa cấp",
  });

  const result = await service.executeAction("admin-1", created.id, {
    resolution: "TAKE_DOWN",
    adminNote: "Gỡ bài do lừa đảo",
  });

  assert.equal(result.status, "RESOLVED");
  assert.equal(result.resolution, "TAKE_DOWN");
  assert.equal(result.resolvedById, "admin-1");
  assert.notEqual(result.resolvedAt, null);
  assert.equal(retractedJobs.length, 1);
  assert.equal(retractedJobs[0].id, "job-1");
});

test("executeAction: Admin chọn DISMISS thì giữ nguyên tin, set RESOLVED và resolution = DISMISS", async () => {
  const { service, retractedJobs, auditLogs, mockJob } = buildTestContext();
  mockJob.status = "PUBLISHED";

  const created = await service.createReport("user-cand-1", "job-1", {
    reason: "SCAM",
    description: "Báo cáo nhầm tin",
  });

  const result = await service.executeAction("admin-1", created.id, {
    resolution: "DISMISS",
    adminNote: "Tin tuyển dụng hợp lệ, bỏ qua báo cáo",
  });

  assert.equal(result.status, "RESOLVED");
  assert.equal(result.resolution, "DISMISS");
  assert.equal(result.resolvedById, "admin-1");
  assert.notEqual(result.resolvedAt, null);
  assert.equal(result.adminNote, "Tin tuyển dụng hợp lệ, bỏ qua báo cáo");
  assert.equal(retractedJobs.length, 0);
  assert.equal(mockJob.status, "PUBLISHED");
  assert.equal(auditLogs.some((l) => l.action === "JOB_REPORT_RESOLVED"), true);
});

test("executeAction: ném 400 REPORT_ALREADY_PROCESSED khi báo cáo đã được xử lý trước đó", async () => {
  const { service, mockJob } = buildTestContext();
  mockJob.status = "PUBLISHED";

  const created = await service.createReport("user-cand-1", "job-1", {
    reason: "SCAM",
    description: "Lừa đảo",
  });

  // Xử lý lần 1
  await service.executeAction("admin-1", created.id, {
    resolution: "TAKE_DOWN",
    adminNote: "Đã gỡ",
  });

  // Cố xử lý lần 2 phải bị từ chối
  await assert.rejects(
    async () => {
      await service.executeAction("admin-1", created.id, {
        resolution: "DISMISS",
      });
    },
    (err: unknown) => {
      assert(err instanceof AppError);
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, "REPORT_ALREADY_PROCESSED");
      return true;
    },
  );
});
