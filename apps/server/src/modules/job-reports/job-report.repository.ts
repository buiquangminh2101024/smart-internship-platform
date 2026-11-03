import type { PrismaClient, Prisma, JobReport, ReportReason, ReportResolution, ReportStatus } from "@prisma/client";
import type { AdminJobReportListQueryDto } from "./job-reports.dto";

export class JobReportRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  async create(
    data: {
      jobId: string;
      reporterId: string;
      reason: ReportReason;
      description?: string | null | undefined;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<JobReport> {
    const client = tx ?? this.prisma;
    return client.jobReport.create({
      data: {
        jobId: data.jobId,
        reporterId: data.reporterId,
        reason: data.reason,
        description: data.description ?? null,
      },
    });
  }

  async findPendingByJobAndReporter(jobId: string, reporterId: string): Promise<JobReport | null> {
    return this.prisma.jobReport.findFirst({
      where: {
        jobId,
        reporterId,
        status: "PENDING",
      },
    });
  }

  async findById(id: string) {
    return this.prisma.jobReport.findUnique({
      where: { id },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            status: true,
            companyId: true,
            company: {
              select: {
                id: true,
                name: true,
              },
            },
            employer: {
              select: {
                id: true,
                userId: true,
              },
            },
          },
        },
        reporter: {
          select: {
            id: true,
            email: true,
            candidate: {
              select: {
                fullName: true,
              },
            },
          },
        },
        resolvedBy: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
  }

  async findManyWithPagination(query: AdminJobReportListQueryDto) {
    const { page, limit, status, resolution, reason, q } = query;
    const where: Prisma.JobReportWhereInput = {};

    if (status && status !== "ALL") {
      where.status = status;
    }

    if (resolution && resolution !== "ALL") {
      where.resolution = resolution;
    }

    if (reason && reason !== "ALL") {
      where.reason = reason;
    }

    if (q) {
      where.OR = [
        {
          job: {
            title: {
              contains: q,
              mode: "insensitive",
            },
          },
        },
        {
          reporter: {
            email: {
              contains: q,
              mode: "insensitive",
            },
          },
        },
      ];
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.jobReport.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          job: {
            select: {
              id: true,
              title: true,
              status: true,
              companyId: true,
              company: {
                select: {
                  id: true,
                  name: true,
                },
              },
              employer: {
                select: {
                  id: true,
                  userId: true,
                },
              },
            },
          },
          reporter: {
            select: {
              id: true,
              email: true,
              candidate: {
                select: {
                  fullName: true,
                },
              },
            },
          },
          resolvedBy: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.jobReport.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async countStats() {
    const [pending, resolved, takeDownCount, dismissCount, total] = await Promise.all([
      this.prisma.jobReport.count({ where: { status: "PENDING" } }),
      this.prisma.jobReport.count({ where: { status: "RESOLVED" } }),
      this.prisma.jobReport.count({ where: { resolution: "TAKE_DOWN" } }),
      this.prisma.jobReport.count({ where: { resolution: "DISMISS" } }),
      this.prisma.jobReport.count(),
    ]);

    return { pending, resolved, takeDownCount, dismissCount, total };
  }

  async update(
    id: string,
    data: {
      status?: ReportStatus;
      resolution?: ReportResolution | null;
      adminNote?: string | null;
      resolvedAt?: Date | null;
      resolvedById?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<JobReport> {
    const client = tx ?? this.prisma;
    const updateData: Prisma.JobReportUpdateInput = {};
    if (data.status !== undefined) {
      updateData.status = data.status;
    }
    if (data.resolution !== undefined) {
      updateData.resolution = data.resolution;
    }
    if (data.adminNote !== undefined) {
      updateData.adminNote = data.adminNote;
    }
    if (data.resolvedAt !== undefined) {
      updateData.resolvedAt = data.resolvedAt;
    }
    if (data.resolvedById !== undefined) {
      updateData.resolvedBy = data.resolvedById
        ? { connect: { id: data.resolvedById } }
        : { disconnect: true };
    }
    return client.jobReport.update({
      where: { id },
      data: updateData,
    });
  }
}
