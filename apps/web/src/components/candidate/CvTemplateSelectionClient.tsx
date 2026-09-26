"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { DUMMY_CV_DATA } from "@/lib/cv-builder";
import { ModernTemplate, ClassicTemplate, MinimalTemplate, ProfileTemplate, ProfessionalTemplate, CreativeTemplate } from "./cv-templates";

const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFViewer),
  { ssr: false, loading: () => <div className="p-10 flex items-center justify-center text-text-muted"><Icon name="loader-circle" size={24} className="animate-spin" /></div> }
);

export const CV_TEMPLATES = [
  {
    id: "classic",
    name: "Classic",
    description: "Mẫu CV truyền thống, rõ ràng và chuyên nghiệp. Phù hợp cho hầu hết mọi ngành nghề.",
    category: "Classic",
    component: ClassicTemplate,
    defaultConfig: { primaryColor: "#1a1a1a", fontFamily: "Roboto" }
  },
  {
    id: "modern",
    name: "Modern",
    description: "Thiết kế hiện đại, làm nổi bật kỹ năng và kinh nghiệm. Có cột bên giúp phân chia thông tin tốt hơn.",
    category: "Modern",
    component: ModernTemplate,
    defaultConfig: { primaryColor: "#059669", fontFamily: "Roboto" }
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Tối giản, tinh tế, tập trung vào nội dung chữ. Rất thân thiện với các hệ thống ATS.",
    category: "Minimal",
    component: MinimalTemplate,
    defaultConfig: { primaryColor: "#000000", fontFamily: "Roboto" }
  },
  {
    id: "profile",
    name: "Profile",
    description: "Mẫu CV có ảnh đại diện ở giữa, tạo ấn tượng cá nhân mạnh mẽ.",
    category: "Avatar",
    component: ProfileTemplate,
    defaultConfig: { primaryColor: "#2563eb", fontFamily: "Roboto" }
  },
  {
    id: "professional",
    name: "Professional",
    description: "Thiết kế hai cột chuyên nghiệp với ảnh đại diện bên trái. Cân đối và hiện đại.",
    category: "Avatar",
    component: ProfessionalTemplate,
    defaultConfig: { primaryColor: "#0891b2", fontFamily: "Roboto" }
  },
  {
    id: "creative",
    name: "Creative",
    description: "Khối tiêu đề màu sắc nổi bật có chứa ảnh đại diện, phù hợp cho ngành sáng tạo.",
    category: "Avatar",
    component: CreativeTemplate,
    defaultConfig: { primaryColor: "#dc2626", fontFamily: "Roboto" }
  }
];

export function CvTemplateSelectionClient() {
  const router = useRouter();
  const [previewTemplate, setPreviewTemplate] = useState<typeof CV_TEMPLATES[0] | null>(null);
  const [sourceModalTemplateId, setSourceModalTemplateId] = useState<string | null>(null);

  function proceedToEditor(source: "profile" | "blank") {
    if (!sourceModalTemplateId) return;
    router.push(`/cv/editor?template=${sourceModalTemplateId}&source=${source}`);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="-ml-2">
          <Icon name="arrow-left" size={16} />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-text-strong">Chọn Mẫu CV</h1>
          <p className="mt-1 text-sm text-text-muted">
            Chọn một mẫu CV phù hợp với phong cách của bạn để bắt đầu. Bạn có thể đổi mẫu sau mà không mất dữ liệu.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
        {CV_TEMPLATES.map((tpl) => (
          <Card key={tpl.id} className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
            <div className="aspect-[1/1.4] w-full bg-neutral-100 flex items-center justify-center border-b border-border-default relative group">
              <div className="absolute inset-0 bg-black/50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
                <Button variant="primary" icon="eye" onClick={() => setPreviewTemplate(tpl)}>
                  Xem trước
                </Button>
                <Button variant="secondary" icon="wand-2" onClick={() => setSourceModalTemplateId(tpl.id)}>
                  Dùng mẫu này
                </Button>
              </div>
              <div className="text-neutral-400 flex flex-col items-center">
                <Icon name="file-text" size={48} className="mb-2 opacity-30" />
                <span className="text-sm font-medium">{tpl.name} Layout</span>
              </div>
            </div>
            <div className="p-4 flex flex-col flex-1">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-text-strong">{tpl.name}</h3>
                <span className="text-xs font-medium bg-pine-50 text-pine-700 px-2 py-0.5 rounded-full">
                  {tpl.category}
                </span>
              </div>
              <p className="text-sm text-text-muted line-clamp-3">{tpl.description}</p>
            </div>
          </Card>
        ))}
      </div>

      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6 backdrop-blur-sm">
          <div className="flex w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-surface-page shadow-2xl h-full max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-border-default px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-text-strong">Xem trước mẫu: {previewTemplate.name}</h3>
                <p className="text-sm text-text-muted">{previewTemplate.description}</p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="primary" icon="wand-2" onClick={() => {
                  setPreviewTemplate(null);
                  setSourceModalTemplateId(previewTemplate.id);
                }}>
                  Dùng mẫu này
                </Button>
                <Button variant="ghost" size="sm" icon="x" onClick={() => setPreviewTemplate(null)} className="text-text-muted">
                  Đóng
                </Button>
              </div>
            </div>
            <div className="flex-1 bg-neutral-200/50 p-6 overflow-hidden">
              <div className="h-full w-full mx-auto max-w-3xl rounded-md overflow-hidden shadow-sm border border-border-default bg-white">
                <PDFViewer className="w-full h-full border-none" showToolbar={false}>
                  <previewTemplate.component data={DUMMY_CV_DATA} config={previewTemplate.defaultConfig} />
                </PDFViewer>
              </div>
            </div>
          </div>
        </div>
      )}

      {sourceModalTemplateId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-surface-page shadow-2xl overflow-hidden">
            <div className="border-b border-border-default p-5">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-text-strong">Bạn muốn tạo CV từ đâu?</h3>
                <button onClick={() => setSourceModalTemplateId(null)} className="text-text-muted hover:text-text-strong p-1">
                  <Icon name="x" size={20} />
                </button>
              </div>
            </div>
            
            <div className="p-5 flex flex-col gap-4">
              <button 
                className="flex items-start gap-4 p-4 rounded-xl border border-border-default hover:border-pine-500 hover:bg-pine-50 transition-colors text-left"
                onClick={() => proceedToEditor("profile")}
              >
                <div className="bg-white p-2 rounded-lg border border-border-subtle shrink-0">
                  <Icon name="user-check" size={24} className="text-pine-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-text-strong">Từ hồ sơ ứng viên</h4>
                  <p className="text-sm text-text-muted mt-1">Hệ thống sẽ tự động điền các thông tin từ /profile vào CV của bạn. Giúp tiết kiệm thời gian.</p>
                </div>
              </button>

              <button 
                className="flex items-start gap-4 p-4 rounded-xl border border-border-default hover:border-pine-500 hover:bg-pine-50 transition-colors text-left"
                onClick={() => proceedToEditor("blank")}
              >
                <div className="bg-white p-2 rounded-lg border border-border-subtle shrink-0">
                  <Icon name="file-plus-2" size={24} className="text-pine-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-text-strong">Tạo CV từ đầu</h4>
                  <p className="text-sm text-text-muted mt-1">Một bản CV trắng trơn theo cấu trúc của template. Bạn sẽ tự nhập toàn bộ thông tin.</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
