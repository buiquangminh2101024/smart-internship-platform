import { useQuery } from "@tanstack/react-query";
import { publicFetch } from "@/lib/api-client";
import type { Company } from "@sip/shared-types";

export function usePublicCompany(companyId: string) {
  return useQuery({
    queryKey: ["publicCompany", companyId],
    queryFn: () => publicFetch<Company>(`/companies/${companyId}/public`),
    enabled: !!companyId,
    staleTime: Infinity,
  });
}

/** Một dòng của GET /companies/public. */
export interface PublicCompanyListItem {
  id: string;
  name: string;
  logoUrl: string | null;
  city: string | null;
  jobCount: number;
}

export function usePublicCompaniesList(searchQuery?: string) {
  return useQuery({
    queryKey: ["publicCompanies", searchQuery],
    queryFn: () => {
      const qs = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : "";
      return publicFetch<PublicCompanyListItem[]>(`/companies/public${qs}`);
    },
    staleTime: 5 * 60 * 1000,
  });
}
