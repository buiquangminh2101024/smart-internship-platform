// Nơi KHÔNG hiện widget trợ lý (docs/05-frontend/phases/support-chatbot/PLAN.md, quyết định 2).
// Chỉnh danh sách này khi kiểm trên trình duyệt.
const HIDDEN_PATHS: RegExp[] = [
  /^\/admin(\/|$)/,
  // Trang nhắn tin: tránh đè khung chat thật.
  /^\/messages(\/|$)/,
  /^\/employer\/messages(\/|$)/,
  // Trình soạn CV toàn màn hình.
  /^\/cv\/editor(\/|$)/,
  // Trang trả về từ cổng thanh toán.
  /^\/employer\/subscription\/return(\/|$)/,
  // Đã là trang liên hệ hỗ trợ.
  /^\/support(\/|$)/,
];

export function isSupportChatHiddenAt(pathname: string): boolean {
  return HIDDEN_PATHS.some((pattern) => pattern.test(pathname));
}
