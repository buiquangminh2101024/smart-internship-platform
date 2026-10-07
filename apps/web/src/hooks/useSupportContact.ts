"use client";

import { useMutation } from "@tanstack/react-query";
import type { SupportContactRequest } from "@sip/shared-types";
import { publicFetch } from "@/lib/api-client";

/**
 * Form hỗ trợ công khai (AD-17, H1–H4): không cần đăng nhập. Server luôn trả
 * "Đã gửi yêu cầu", dù email có tài khoản hay không; quá giới hạn thì 429.
 */
export function useSubmitSupportContact() {
  return useMutation({
    mutationFn: (data: SupportContactRequest) =>
      publicFetch("/support/contact", { method: "POST", body: JSON.stringify(data) }),
  });
}
