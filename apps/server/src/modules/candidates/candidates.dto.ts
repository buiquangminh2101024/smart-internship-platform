import { z } from "zod";

export const candidateProfileSchema = z.object({
  headline: z.string().trim().max(255).optional(),
  bio: z.string().trim().max(2000).optional(),
  phone: z.string().trim().min(9).max(15).optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  avatarUrl: z.string().trim().url().optional(),
  cityId: z.string().trim().min(1).optional(),
});

export const candidateProfilePatchSchema = candidateProfileSchema.partial();

export const educationSchema = z.object({
  universityId: z.string().trim().min(1).optional(),
  majorId: z.string().trim().min(1).optional(),
  degree: z.string().trim().max(120).optional(),
  startYear: z.coerce.number().int().min(1900).max(2100).optional(),
  endYear: z.coerce.number().int().min(1900).max(2100).optional(),
  isCurrent: z.boolean().optional(),
  description: z.string().trim().max(1000).optional(),
});

export const educationPatchSchema = educationSchema.partial();

export const workExperienceSchema = z.object({
  company: z.string().trim().min(1).max(200),
  position: z.string().trim().min(1).max(200),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  isCurrent: z.boolean().optional(),
  description: z.string().trim().max(2000).optional(),
});

export const workExperiencePatchSchema = workExperienceSchema.partial();

export const projectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  url: z.string().trim().url().optional(),
  isWorkingOn: z.boolean().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const projectPatchSchema = projectSchema.partial();

export const certificateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  issuer: z.string().trim().max(200).optional(),
  issueDate: z.coerce.date().optional(),
  credentialUrl: z.string().trim().url().optional(),
  description: z.string().trim().max(2000).optional(),
});

export const certificatePatchSchema = certificateSchema.partial();

export const awardSchema = z.object({
  name: z.string().trim().min(1).max(200),
  issuer: z.string().trim().max(200).optional(),
  date: z.coerce.date().optional(),
  description: z.string().trim().max(2000).optional(),
});

export const awardPatchSchema = awardSchema.partial();

export const skillSchema = z.object({
  skillId: z.string().trim().min(1),
  yearsOfExperience: z.coerce.number().min(0).max(60).optional(),
});
