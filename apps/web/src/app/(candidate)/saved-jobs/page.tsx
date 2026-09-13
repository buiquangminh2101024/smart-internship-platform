import type { Metadata } from "next";
import { SavedJobsClient } from "@/components/candidate/SavedJobsClient";

export const metadata: Metadata = { title: "Việc làm đã lưu — InternHub" };

export default function SavedJobsPage() {
  return <SavedJobsClient />;
}
