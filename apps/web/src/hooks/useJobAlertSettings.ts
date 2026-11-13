"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JobAlertSettings, UpdateJobAlertSettingsRequest } from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";

// Cài đặt job alert (AD-26 D7–D9) — GET/PATCH /candidate/job-alert-settings.
// docs/05-frontend/phases/job-discovery/PLAN.md bước F4.

export const JOB_ALERT_SETTINGS_KEY = ["candidate", "job-alert-settings"] as const;

/** Mã lỗi backend khi bật "Chỉ tin ở thành phố của tôi" mà hồ sơ chưa có thành phố. */
export const JOB_ALERT_CITY_REQUIRED = "JOB_ALERT_CITY_REQUIRED";

export function useJobAlertSettings(enabled: boolean) {
  return useQuery({
    queryKey: JOB_ALERT_SETTINGS_KEY,
    queryFn: () => apiFetch<JobAlertSettings>("candidate", "/candidate/job-alert-settings"),
    enabled,
    // Thành phố (chỉ đọc) đổi ở /profile, nên quay lại trang là đọc lại.
    staleTime: 0,
  });
}

/**
 * Mỗi công tắc gửi riêng một PATCH. Đổi trạng thái ngay khi bấm (optimistic), lỗi thì trả lại
 * như cũ; thành công thì lấy đúng bản server trả về.
 */
export function useUpdateJobAlertSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateJobAlertSettingsRequest) =>
      apiFetch<JobAlertSettings>("candidate", "/candidate/job-alert-settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: JOB_ALERT_SETTINGS_KEY });
      const previous = queryClient.getQueryData<JobAlertSettings>(JOB_ALERT_SETTINGS_KEY);
      if (previous) queryClient.setQueryData<JobAlertSettings>(JOB_ALERT_SETTINGS_KEY, { ...previous, ...patch });
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(JOB_ALERT_SETTINGS_KEY, context.previous);
    },
    onSuccess: (settings) => {
      queryClient.setQueryData<JobAlertSettings>(JOB_ALERT_SETTINGS_KEY, settings);
    },
  });
}
