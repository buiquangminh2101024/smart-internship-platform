"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const CvEditorClient = dynamic(
  () => import("@/components/candidate/CvEditorClient").then((mod) => mod.CvEditorClient),
  { ssr: false, loading: () => <div className="p-10 text-center text-text-muted">Đang tải trình chỉnh sửa...</div> }
);

export function CvEditorWrapper() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-text-muted">Đang tải...</div>}>
      <CvEditorClient />
    </Suspense>
  );
}
