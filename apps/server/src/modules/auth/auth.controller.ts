import type { NextFunction, Request, Response } from "express";
import type { ApiResponse } from "@sip/shared-types";
import type { AuthService, AuthTokens } from "./auth.service";

export class AuthController {
  private readonly authService: AuthService;

  constructor({ authService }: { authService: AuthService }) {
    this.authService = authService;
  }

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, role } = req.body as { email: string; password: string; role: "CANDIDATE" | "EMPLOYER" };
      await this.authService.register({ email, password, role, ip: req.ip ?? "unknown" });
      const body: ApiResponse = { success: true, message: "Registered — check your email for the OTP code" };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  };

  verifyOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, otp } = req.body as { email: string; otp: string };
      const tokens = await this.authService.verifyOtp(email, otp);
      const body: ApiResponse<AuthTokens> = { success: true, data: tokens };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  resendOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body as { email: string };
      await this.authService.resendOtp(email, req.ip ?? "unknown");
      const body: ApiResponse = { success: true, message: "OTP resent" };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const tokens = await this.authService.login(email, password);
      const body: ApiResponse<AuthTokens> = { success: true, data: tokens };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  google = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { idToken, role } = req.body as { idToken: string; role: "CANDIDATE" | "EMPLOYER" };
      const tokens = await this.authService.loginOrRegisterWithGoogle(idToken, role);
      const body: ApiResponse<AuthTokens> = { success: true, data: tokens };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body as { email: string };
      await this.authService.forgotPassword(email, req.ip ?? "unknown");
      const body: ApiResponse = { success: true, message: "If the email exists, an OTP has been sent" };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, otp, newPassword } = req.body as { email: string; otp: string; newPassword: string };
      await this.authService.resetPassword(email, otp, newPassword);
      const body: ApiResponse = { success: true, message: "Password updated" };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body as { refreshToken: string };
      const result = await this.authService.refresh(refreshToken);
      const body: ApiResponse<{ accessToken: string }> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  // Bảo vệ bằng middleware `authenticate` ở route (xem auth.routes.ts) —
  // req.user luôn có giá trị ở đây, dùng jti/exp của access token hiện tại
  // để blacklist, không cần verify lại token thủ công trong controller.
  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body as { refreshToken?: string };
      await this.authService.logout({ jti: req.user!.jti, exp: req.user!.exp }, refreshToken);
      const body: ApiResponse = { success: true, message: "Logged out" };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
