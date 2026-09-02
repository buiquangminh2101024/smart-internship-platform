import { Resend } from "resend";
import type { EmailMessage, EmailSender } from "../shared/ports/EmailSender";
import { AppError } from "../shared/errors/AppError";

interface ResendConfig {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
}

export class ResendEmailSender implements EmailSender {
  private readonly resendConfig: ResendConfig;

  // Không tạo `Resend` client / kiểm tra config trong constructor: instance này
  // bị resolve (và do đó constructor chạy) ngay khi `AuthService` được khởi tạo
  // lần đầu (awilix PROXY resolution destructure cradle), kể cả khi
  // OTP_HARDCODE=true và send() không bao giờ được gọi thật ở dev. Validate
  // config lười (lazy) trong send() để không phá luồng dev không cấu hình Resend.
  constructor({ config: appConfig }: { config: ResendConfig }) {
    this.resendConfig = appConfig;
  }

  async send(message: EmailMessage): Promise<void> {
    if (!this.resendConfig.RESEND_API_KEY || !this.resendConfig.RESEND_FROM_EMAIL) {
      throw new AppError(500, "RESEND_API_KEY/RESEND_FROM_EMAIL is not configured");
    }

    const client = new Resend(this.resendConfig.RESEND_API_KEY);
    const { error } = await client.emails.send({
      from: this.resendConfig.RESEND_FROM_EMAIL,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });

    if (error) {
      throw new AppError(502, `Failed to send email: ${error.message}`);
    }
  }
}
