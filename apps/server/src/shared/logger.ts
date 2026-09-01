// Wrapper console mỏng cho logging. Thay bằng Winston/Pino sau nếu nhu cầu
// thực tế phát sinh (xem INITIAL_ARCHITECTURE_PLAN.md mục "Đã chốt ở Phase 1").
export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.log(`[info] ${message}`, meta ?? "");
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[warn] ${message}`, meta ?? "");
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(`[error] ${message}`, meta ?? "");
  },
};

export type Logger = typeof logger;
