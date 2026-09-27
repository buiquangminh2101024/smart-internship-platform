import type { Metadata } from "next";
import { CvEditorWrapper } from "@/components/candidate/CvEditorWrapper";

export const metadata: Metadata = { title: "Chỉnh sửa CV — InternHub" };

export default function CvEditorPage() {
  return <CvEditorWrapper />;
}
