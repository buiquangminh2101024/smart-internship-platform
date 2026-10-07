import { AppError } from "../../shared/errors/AppError";
import type { RateLimiter } from "../../shared/ports/RateLimiter";
import type { NotificationsService } from "../notifications/notifications.service";
import type { UserRepository } from "../users/user.repository";
import { SUPPORT_MAX_PER_EMAIL_PER_HOUR, SUPPORT_MAX_PER_IP_PER_HOUR } from "./support.constants";
import type { SupportContactInput } from "./support.dto";

const ONE_HOUR_SECONDS = 60 * 60;

/**
 * Trang hỗ trợ bản A (AD-17, H1–H4): chuyển lời nhắn của khách tới mọi Admin
 * qua thông báo trong app + email. Nền tảng không lưu phiếu hỗ trợ — Admin trả
 * lời người gửi bằng email riêng.
 */
export class SupportService {
  private readonly rateLimiter: RateLimiter;
  private readonly userRepository: UserRepository;
  private readonly notificationsService: NotificationsService;

  constructor({
    rateLimiter,
    userRepository,
    notificationsService,
  }: {
    rateLimiter: RateLimiter;
    userRepository: UserRepository;
    notificationsService: NotificationsService;
  }) {
    this.rateLimiter = rateLimiter;
    this.userRepository = userRepository;
    this.notificationsService = notificationsService;
  }

  async submitContact(input: SupportContactInput, ip: string): Promise<void> {
    const ipOk = await this.rateLimiter.consume(`support:ip:${ip}`, SUPPORT_MAX_PER_IP_PER_HOUR, ONE_HOUR_SECONDS);
    const emailOk = ipOk && (await this.rateLimiter.consume(`support:email:${input.email}`, SUPPORT_MAX_PER_EMAIL_PER_HOUR, ONE_HOUR_SECONDS));
    if (!ipOk || !emailOk) {
      throw new AppError(429, "Bạn đã gửi quá nhiều yêu cầu, vui lòng thử lại sau");
    }

    // Trạng thái tài khoản chỉ để Admin xem — không bao giờ trả về cho người gửi
    // (không tiết lộ email có tài khoản hay không).
    const [account, adminIds] = await Promise.all([
      this.userRepository.findByEmail(input.email),
      this.userRepository.findAdminIds(),
    ]);

    await this.notificationsService.notifyMany("SUPPORT_CONTACT_RECEIVED", adminIds, {
      email: input.email,
      category: input.category,
      message: input.message,
      accountStatus: account?.status ?? null,
    });
  }
}
