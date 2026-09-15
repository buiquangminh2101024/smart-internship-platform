"use client";

import { useQuery } from "@tanstack/react-query";
import type { CatalogItem } from "@sip/shared-types";
import { publicFetch } from "@/lib/api-client";

const CATALOG_STALE_TIME_MS = 5 * 60 * 1000;

function useCatalogList(path: string, key: string) {
  return useQuery({
    queryKey: ["catalog", key],
    queryFn: () => publicFetch<CatalogItem[]>(path),
    staleTime: CATALOG_STALE_TIME_MS,
  });
}

export function useIndustries() {
  return useCatalogList("/industries", "industries");
}

export function useCompanyTypes() {
  return useCatalogList("/company-types", "company-types");
}

export function useCities() {
  return useCatalogList("/cities", "cities");
}

/** Chỉ kỹ năng đã duyệt — skill người dùng tự đề xuất không nằm trong danh sách này. */
export function useSkills() {
  return useCatalogList("/catalog/skills", "skills");
}
