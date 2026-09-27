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

export function usePublicCompaniesList(searchQuery?: string) {
  return useQuery({
    queryKey: ["publicCompanies", searchQuery],
    queryFn: () => {
      const qs = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : "";
      return publicFetch<any[]>(`/companies/public${qs}`);
    },
    staleTime: 5 * 60 * 1000,
  });
}
