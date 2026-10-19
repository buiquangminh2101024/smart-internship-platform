import type { RequestHandler } from "express";
import type { AwilixContainer } from "awilix";
import { authenticate } from "./authenticate";

/**
 * Route công khai nhưng đọc token nếu có (chatbot hỗ trợ — docs/06-backend/support-chatbot/PLAN.md
 * mục "Xác thực tuỳ chọn"). Không có header ⇒ khách. Có header mà token sai/hết hạn/bị thu hồi
 * ⇒ 401 như `authenticate`, để frontend refresh rồi gửi lại thay vì âm thầm hạ xuống khách.
 * Bọc lại `authenticate` chứ không chép logic kiểm token.
 */
export function optionalAuthenticate(container: AwilixContainer): RequestHandler {
  const auth = authenticate(container);
  return (req, res, next) => (req.headers.authorization ? auth(req, res, next) : next());
}
