"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ModernTemplate, ClassicTemplate, MinimalTemplate, ProfileTemplate, ProfessionalTemplate, CreativeTemplate } from "./cv-templates";
import { CvTemplateThumbnail } from "./CvTemplateThumbnail";

export const CV_TEMPLATES = [
  {
    id: "classic",
    name: "Classic",
    description: "Mẫu CV truyền thống, rõ ràng và chuyên nghiệp. Phù hợp cho hầu hết mọi ngành nghề.",
    category: "Classic",
    component: ClassicTemplate,
    defaultConfig: { primaryColor: "#1a1a1a", fontFamily: "Roboto" },
    hasAvatar: false
  },
  {
    id: "modern",
    name: "Modern",
    description: "Thiết kế hiện đại, làm nổi bật kỹ năng và kinh nghiệm. Có cột bên giúp phân chia thông tin tốt hơn.",
    category: "Modern",
    component: ModernTemplate,
    defaultConfig: { primaryColor: "#059669", fontFamily: "Roboto" },
    hasAvatar: false
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Tối giản, tinh tế, tập trung vào nội dung chữ. Rất thân thiện với các hệ thống ATS.",
    category: "Minimal",
    component: MinimalTemplate,
    defaultConfig: { primaryColor: "#000000", fontFamily: "Roboto" },
    hasAvatar: false
  },
  {
    id: "profile",
    name: "Profile",
    description: "Mẫu CV có ảnh đại diện ở giữa, tạo ấn tượng cá nhân mạnh mẽ.",
    category: "Avatar",
    component: ProfileTemplate,
    defaultConfig: { primaryColor: "#2563eb", fontFamily: "Roboto" },
    hasAvatar: true
  },
  {
    id: "professional",
    name: "Professional",
    description: "Thiết kế hai cột chuyên nghiệp với ảnh đại diện bên trái. Cân đối và hiện đại.",
    category: "Avatar",
    component: ProfessionalTemplate,
    defaultConfig: { primaryColor: "#0891b2", fontFamily: "Roboto" },
    hasAvatar: true
  },
  {
    id: "creative",
    name: "Creative",
    description: "Khối tiêu đề màu sắc nổi bật có chứa ảnh đại diện, phù hợp cho ngành sáng tạo.",
    category: "Avatar",
    component: CreativeTemplate,
    defaultConfig: { primaryColor: "#dc2626", fontFamily: "Roboto" },
    hasAvatar: true
  }
];

export function CvTemplateSelectionClient() {
  const router = useRouter();
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
          <Card 
            key={tpl.id} 
            className="flex flex-col overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-pine-400 group cursor-pointer"
            onClick={() => setSourceModalTemplateId(tpl.id)}
          >
            {/* Paper preview container with neutral background to clearly contrast with white CV paper */}
            <div className="aspect-[1/1.4] w-full bg-neutral-100/90 p-4 border-b border-border-default flex items-center justify-center">
              <CvTemplateThumbnail 
                templateId={tpl.id} 
                primaryColor={tpl.defaultConfig.primaryColor} 
              />
            </div>
            <div className="p-4 flex flex-col flex-1 justify-between gap-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="font-semibold text-text-strong group-hover:text-pine-700 transition-colors">{tpl.name}</h3>
                  <span className="text-xs font-medium bg-pine-50 text-pine-700 px-2 py-0.5 rounded-full border border-pine-100">
                    {tpl.category}
                  </span>
                </div>
                <p className="text-sm text-text-muted line-clamp-2 leading-relaxed">{tpl.description}</p>
              </div>
              <Button 
                variant="primary" 
                size="sm" 
                icon="wand-2" 
                className="w-full mt-1"
                onClick={(e) => {
                  e.stopPropagation();
                  setSourceModalTemplateId(tpl.id);
                }}
              >
                Dùng mẫu này
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {sourceModalTemplateId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl bg-surface-page shadow-2xl overflow-hidden border border-border-default">
            <div className="border-b border-border-default p-5 bg-neutral-50/50">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-text-strong">Bạn muốn tạo CV từ đâu?</h3>
                <button 
                  onClick={() => setSourceModalTemplateId(null)} 
                  className="text-text-muted hover:text-text-strong p-1 rounded-md hover:bg-neutral-200/60 transition-colors"
                >
                  <Icon name="x" size={20} />
                </button>
              </div>
            </div>
            
            <div className="p-5 flex flex-col gap-3">
              <button 
                className="flex items-start gap-4 p-4 rounded-xl border border-border-default hover:border-pine-500 hover:bg-pine-50/50 transition-all text-left group"
                onClick={() => proceedToEditor("profile")}
              >
                <div className="bg-white p-2.5 rounded-lg border border-border-subtle shrink-0 group-hover:border-pine-300 shadow-2xs">
                  <Icon name="user-check" size={24} className="text-pine-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-text-strong group-hover:text-pine-700 transition-colors">Từ hồ sơ ứng viên</h4>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">Hệ thống sẽ tự động điền các thông tin từ hồ sơ của bạn vào CV. Tiết kiệm thời gian nhất.</p>
                </div>
              </button>

              <button 
                className="flex items-start gap-4 p-4 rounded-xl border border-border-default hover:border-pine-500 hover:bg-pine-50/50 transition-all text-left group"
                onClick={() => proceedToEditor("blank")}
              >
                <div className="bg-white p-2.5 rounded-lg border border-border-subtle shrink-0 group-hover:border-pine-300 shadow-2xs">
                  <Icon name="file-plus-2" size={24} className="text-pine-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-text-strong group-hover:text-pine-700 transition-colors">Tạo CV từ đầu</h4>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">Một bản CV trắng theo khung chuẩn của template. Bạn sẽ tự nhập toàn bộ thông tin.</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
