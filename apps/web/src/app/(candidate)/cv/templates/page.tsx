import type { Metadata } from "next";
import { CvTemplateSelectionClient } from "@/components/candidate/CvTemplateSelectionClient";

export const metadata: Metadata = { title: "Chọn Mẫu CV — InternHub" };

export default function CvTemplatesPage() {
  return <CvTemplateSelectionClient />;
}
