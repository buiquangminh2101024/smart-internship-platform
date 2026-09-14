import { z } from "zod";
import { ApplicationStatus } from "@prisma/client";

export const createApplicationSchema = z.object({
  jobPostId: z.string().cuid(),
  cvId: z.string().cuid(),
  coverLetter: z.string().max(2000).optional(),
});

export const updateApplicationStatusSchema = z.object({
  status: z.nativeEnum(ApplicationStatus),
});

export const updateApplicationEvaluationSchema = z.object({
  employerNotes: z.string().max(2000).optional().nullable(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
});

