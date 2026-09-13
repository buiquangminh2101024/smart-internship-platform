import type { Metadata } from "next";
import { CvManagementClient } from "@/components/candidate/CvManagementClient";

export const metadata: Metadata = { title: "Quản lý CV — InternHub" };

export default function CvPage() {
  return <CvManagementClient />;
}
