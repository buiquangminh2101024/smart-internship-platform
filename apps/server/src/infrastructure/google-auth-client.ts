import { OAuth2Client } from "google-auth-library";
import { AppError } from "../shared/errors/AppError";

export interface GoogleProfile {
  googleId: string;
  email: string;
}

// Không định nghĩa như một `shared/ports/*` interface riêng vì chỉ có một
// nhà cung cấp OAuth (Google) trong phạm vi dự án — khác với EmailSender/
// RateLimiter/OtpStore/TokenBlacklist vốn có lý do rõ ràng để thay adapter
// (đổi provider Redis/email). Nếu sau này cần thêm provider OAuth khác mới
// tách interface.
export class GoogleAuthClient {
  private readonly client: OAuth2Client;
  private readonly clientId: string | undefined;

  constructor({ config: appConfig }: { config: { GOOGLE_CLIENT_ID?: string } }) {
    this.clientId = appConfig.GOOGLE_CLIENT_ID;
    this.client = new OAuth2Client(this.clientId);
  }

  async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    if (!this.clientId) {
      throw new AppError(500, "GOOGLE_CLIENT_ID is not configured");
    }

    let ticket;
    try {
      ticket = await this.client.verifyIdToken({ idToken, audience: this.clientId });
    } catch {
      throw new AppError(401, "Invalid Google ID token");
    }

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new AppError(401, "Invalid Google ID token payload");
    }
    // Email trong token chỉ đáng tin khi Google đã xác thực nó (AD-17) — luồng
    // liên kết tài khoản theo email và G1 đều dựa vào điều này.
    if (payload.email_verified !== true) {
      throw new AppError(401, "Google account email is not verified", "GOOGLE_EMAIL_UNVERIFIED");
    }

    return { googleId: payload.sub, email: payload.email };
  }
}
