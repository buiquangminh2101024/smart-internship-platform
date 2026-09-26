import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export function useEmployerCandidateProfile(candidateId: string) {
  return useQuery({
    queryKey: ["employer-candidate-profile", candidateId],
    queryFn: async () => {
      return apiFetch<any>("employer", `/employer/candidates/${candidateId}`);
    },
    enabled: !!candidateId,
  });
}
