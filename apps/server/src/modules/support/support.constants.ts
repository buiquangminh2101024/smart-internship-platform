import type { SupportCategory } from "@sip/shared-types";

// AD-17 (H3) — loại vấn đề của form /support bản A.
export const SUPPORT_CATEGORIES = ["ACCOUNT_SUSPENDED", "OTHER"] as const satisfies readonly SupportCategory[];

// H2 — chống spam form công khai: theo IP và theo email người gửi.
export const SUPPORT_MAX_PER_IP_PER_HOUR = 5;
export const SUPPORT_MAX_PER_EMAIL_PER_HOUR = 3;
