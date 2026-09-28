import type { Metadata } from "next";
import { JobRecommendationsClient } from "@/components/candidate/JobRecommendationsClient";

export const metadata: Metadata = { title: "Việc làm phù hợp — InternHub" };

export default function RecommendedJobsPage() {
  return <JobRecommendationsClient />;
}
