import { z } from "zod";

// Role client-selectable luôn giới hạn CANDIDATE/EMPLOYER — không endpoint
// nào trong module auth được phép nhận role=ADMIN (xem INITIAL_ARCHITECTURE_PLAN.md §10/§12b).
const registrableRole = z.enum(["CANDIDATE", "EMPLOYER"]);

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: registrableRole,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  otp: z.string().length(6),
});

export const resendOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(1),
  role: registrableRole,
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  otp: z.string().length(6),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});
