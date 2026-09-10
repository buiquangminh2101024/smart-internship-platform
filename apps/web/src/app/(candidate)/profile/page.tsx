import type { Metadata } from "next";
import { CandidateProfileClient } from "@/components/candidate/CandidateProfileClient";

export const metadata: Metadata = { title: "Hồ sơ ứng viên — InternHub" };

export default function ProfilePage() {
  return <CandidateProfileClient />;
}