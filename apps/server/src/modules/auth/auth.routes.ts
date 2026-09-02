import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtService } from "./jwt.service";
import { validate } from "../../shared/middleware/validate";
import { authenticate } from "../../shared/middleware/authenticate";
import {
  forgotPasswordSchema,
  googleAuthSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resendOtpSchema,
  resetPasswordSchema,
  verifyOtpSchema,
} from "./auth.dto";

export function authRouter(container: AwilixContainer): Router {
  container.register({
    jwtService: asClass(JwtService).singleton(),
    authService: asClass(AuthService).singleton(),
    authController: asClass(AuthController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<AuthController>("authController");

  router.post("/auth/register", validate(registerSchema), (req, res, next) => {
    void resolveController().register(req, res, next);
  });
  router.post("/auth/verify-otp", validate(verifyOtpSchema), (req, res, next) => {
    void resolveController().verifyOtp(req, res, next);
  });
  router.post("/auth/resend-otp", validate(resendOtpSchema), (req, res, next) => {
    void resolveController().resendOtp(req, res, next);
  });
  router.post("/auth/login", validate(loginSchema), (req, res, next) => {
    void resolveController().login(req, res, next);
  });
  router.post("/auth/google", validate(googleAuthSchema), (req, res, next) => {
    void resolveController().google(req, res, next);
  });
  router.post("/auth/forgot-password", validate(forgotPasswordSchema), (req, res, next) => {
    void resolveController().forgotPassword(req, res, next);
  });
  router.post("/auth/reset-password", validate(resetPasswordSchema), (req, res, next) => {
    void resolveController().resetPassword(req, res, next);
  });
  router.post("/auth/refresh", validate(refreshSchema), (req, res, next) => {
    void resolveController().refresh(req, res, next);
  });
  router.post("/auth/logout", authenticate(container), validate(logoutSchema), (req, res, next) => {
    void resolveController().logout(req, res, next);
  });

  return router;
}
