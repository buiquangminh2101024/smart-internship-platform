import { z } from "zod";

// req.body của multipart/form-data (multer) chỉ chứa string — field trống gửi
// lên là "" thay vì bị lược bỏ, nên optional string cần preprocess "" -> undefined.
const optionalString = () =>
  z.preprocess((value) => (value === "" || value === undefined ? undefined : value), z.string().min(1).optional());

export const verificationCheckSchema = z.object({
  taxCode: z.string().trim().min(1, "Tax code is required"),
});

export const createCompanySchema = z.object({
  name: z.string().trim().min(1, "Company name is required"),
  taxCode: z.string().trim().min(1, "Tax code is required"),
  industryId: optionalString(),
  companyTypeId: optionalString(),
  cityId: optionalString(),
  address: optionalString(),
  description: optionalString(),
  website: optionalString(),
  foundedYear: z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : Number(value)),
    z.number().int().min(1900).max(2100).optional(),
  ),
  title: optionalString(),
  phone: optionalString(),
  // Employer chủ động xác nhận "vẫn gửi yêu cầu xác thực thủ công" sau khi
  // nhận outcome BLOCKED từ /employers/company/verification-check.
  forceManualReview: z.preprocess((value) => value === "true" || value === true, z.boolean()).optional(),
});

export const joinCompanySchema = z.object({
  inviteCode: z.string().trim().length(6, "Invite code must be 6 digits"),
});

export const updateEmployerProfileSchema = z.object({
  title: optionalString(),
  phone: optionalString(),
});
