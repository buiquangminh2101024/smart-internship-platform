// Đổi chuỗi thời hạn kiểu "15m", "7d" (JWT_ACCESS_EXPIRY / JWT_REFRESH_EXPIRY)
// ra giây — dùng cho TTL khoá Redis phải sống bằng access token (AD-18).
//
// Bắt buộc có đơn vị: jsonwebtoken đọc chuỗi bằng thư viện `ms`, nên "60" (không
// đơn vị) bị hiểu là 60 MILI giây chứ không phải 60 giây. Chỉ nhận s|m|h|d để
// kết quả ở đây luôn khớp với thời hạn thật của token.
export const DURATION_PATTERN = /^(\d+)(s|m|h|d)$/;

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 60 * 60, d: 24 * 60 * 60 };

export function durationToSeconds(value: string): number {
  const match = DURATION_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Invalid duration "${value}" — expected <number><s|m|h|d>, e.g. "15m"`);
  }
  return Number(match[1]) * UNIT_SECONDS[match[2]!]!;
}
