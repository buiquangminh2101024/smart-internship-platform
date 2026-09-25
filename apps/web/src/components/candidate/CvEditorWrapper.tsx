"use client";

import dynamic from "next/dynamic";

const CvEditorClient = dynamic(
  () => import("@/components/candidate/CvEditorClient").then((mod) => mod.CvEditorClient),
  { ssr: false, loading: () => <div className="p-10 text-center text-text-muted">Đang tải trình chỉnh sửa...</div> }
);

export function CvEditorWrapper() {
  return <CvEditorClient />;
}
