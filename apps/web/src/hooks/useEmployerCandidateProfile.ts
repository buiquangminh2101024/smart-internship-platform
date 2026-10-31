import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

type DateValue = string | null;

/** Các trường trang hồ sơ ứng viên phía nhà tuyển dụng đang dùng (GET /employer/candidates/:id). */
export interface EmployerCandidateProfile {
  fullName: string | null;
  headline: string | null;
  bio: string | null;
  avatarUrl: string | null;
  phone: string | null;
  gender: string | null;
  city: { name: string } | null;
  user?: { email: string } | null;
  skills: { skill: { id: string; name: string }; yearsOfExperience: number }[];
  workExperiences: {
    id: string;
    position: string;
    company: string;
    startDate: DateValue;
    endDate: DateValue;
    isCurrent: boolean;
    description: string | null;
  }[];
  educations: {
    id: string;
    university: { name: string } | null;
    major: { name: string } | null;
    degree: string | null;
    startYear: number | null;
    endYear: number | null;
    isCurrent: boolean;
    description: string | null;
  }[];
  projects: {
    id: string;
    name: string;
    url: string | null;
    startDate: DateValue;
    endDate: DateValue;
    isWorkingOn: boolean;
    description: string | null;
  }[];
  certificates: { id: string; name: string; issuer: string | null; issueDate: DateValue }[];
  awards: { id: string; name: string; issuer: string | null; date: DateValue }[];
}

export function useEmployerCandidateProfile(candidateId: string) {
  return useQuery({
    queryKey: ["employer-candidate-profile", candidateId],
    queryFn: async () => {
      return apiFetch<EmployerCandidateProfile>("employer", `/employer/candidates/${candidateId}`);
    },
    enabled: !!candidateId,
  });
}
