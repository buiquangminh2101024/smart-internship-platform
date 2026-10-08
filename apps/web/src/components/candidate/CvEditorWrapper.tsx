"use client";

import dynamic from "next/dynamic";

const CvEditorClient = dynamic(
  () => import("@/components/candidate/CvEditorClient").then((mod) => mod.CvEditorClient),
  { ssr: false, loading: () => <div className="p-10 text-center text-text-muted">Đang tải trình chỉnh sửa...</div> }
);

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function CvEditorInner() {
  const searchParams = useSearchParams();
  const cvId = searchParams.get("cvId") || undefined;
  const sourceParam = searchParams.get("source") || undefined;
  const templateIdParam = searchParams.get("template") || undefined;

  return <CvEditorClient cvId={cvId} sourceParam={sourceParam} templateIdParam={templateIdParam} />;
}

export function CvEditorWrapper() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-text-muted">Đang tải...</div>}>
      <CvEditorInner />
    </Suspense>
  );
}
