import type { Logger } from "../shared/logger";
import type { EmailMessage, EmailSender } from "../shared/ports/EmailSender";

/**
 * DEV ONLY (DEV_SKIP_EMAIL_SENDING=true): không gọi Resend, chỉ in email ra
 * console server — tiện khi đăng ký thử bằng địa chỉ email giả. Không bao giờ
 * throw, nên outbox job đánh dấu COMPLETED như gửi thành công.
 */
export class ConsoleEmailSender implements EmailSender {
  private readonly logger: Logger;

  constructor({ logger }: { logger: Logger }) {
    this.logger = logger;
  }

  async send(message: EmailMessage): Promise<void> {
    this.logger.info("[DEV_SKIP_EMAIL_SENDING] Email không được gửi thật", {
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
  }
}
