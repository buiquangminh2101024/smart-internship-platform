import { useRef, useState } from "react";
import { useUploadCvBuilderImage } from "@/hooks/useCvs";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { CvBuilderData, CvBuilderConfig } from "@/lib/cv-builder";
import { CV_TEMPLATES } from "../CvTemplateSelectionClient";
import { CvTemplateThumbnail } from "../CvTemplateThumbnail";

export type EditorTab = "design" | "content" | "layout" | "templates";

interface CvEditorFormProps {
  data: CvBuilderData;
  onChange: (data: CvBuilderData) => void;
  config: CvBuilderConfig;
  onConfigChange: (config: CvBuilderConfig) => void;
  activeTemplateId: string;
  onChangeTemplate: (templateId: string) => void;
  activeTab: EditorTab;
}

const SECTION_TITLES: Record<string, string> = {
  personal: "Thông tin cá nhân",
  summary: "Mục tiêu nghề nghiệp",
  experiences: "Kinh nghiệm làm việc",
  educations: "Học vấn",
  projects: "Dự án",
  skills: "Kỹ năng",
  certificates: "Chứng chỉ"
};

export function CvEditorForm({ data, onChange, config, onConfigChange, activeTemplateId, onChangeTemplate, activeTab }: CvEditorFormProps) {
  const [activeSection, setActiveSection] = useState<string>("personal");
  const [templateToSwitch, setTemplateToSwitch] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [avatarError, setAvatarError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const uploadImage = useUploadCvBuilderImage();

  const updateSection = <K extends keyof CvBuilderData>(sectionKey: K, value: CvBuilderData[K]) => {
    onChange({ ...data, [sectionKey]: value });
  };

  // Helper to get item count badge for accordion headers and layout
  const getSectionBadge = (sectionId: string) => {
    switch (sectionId) {
      case "experiences":
        return data.experiences.length > 0 ? `${data.experiences.length}` : null;
      case "educations":
        return data.educations.length > 0 ? `${data.educations.length}` : null;
      case "projects":
        return data.projects.length > 0 ? `${data.projects.length}` : null;
      case "skills":
        return data.skills.length > 0 ? `${data.skills.length}` : null;
      case "certificates":
        return data.certificates.length > 0 ? `${data.certificates.length}` : null;
      case "summary":
        return data.summary.trim() ? "✓" : null;
      default:
        return null;
    }
  };

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError("");
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setAvatarError("Chỉ hỗ trợ ảnh JPG hoặc PNG.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("Ảnh phải nhỏ hơn 2MB.");
      return;
    }
    try {
      const { url } = await uploadImage.mutateAsync(file);
      onChange({ ...data, personal: { ...data.personal, avatarUrl: url } });
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Tải ảnh thất bại.");
    }
  };

  const moveSection = (index: number, direction: "up" | "down") => {
    const newOrder = [...data.sectionOrder];
    if (direction === "up" && index > 0) {
      const temp = newOrder[index - 1]!;
      newOrder[index - 1] = newOrder[index]!;
      newOrder[index] = temp;
    } else if (direction === "down" && index < newOrder.length - 1) {
      const temp = newOrder[index + 1]!;
      newOrder[index + 1] = newOrder[index]!;
      newOrder[index] = temp;
    }
    onChange({ ...data, sectionOrder: newOrder });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    if (index === 0 || draggedIndex === 0) return; // Không cho phép kéo đè lên personal hoặc kéo personal

    const newOrder = [...data.sectionOrder];
    const item = newOrder.splice(draggedIndex, 1)[0];
    newOrder.splice(index, 0, item!);
    onChange({ ...data, sectionOrder: newOrder });
    setDraggedIndex(null);
  };

  if (activeTab === "design") {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-border-default bg-neutral-50/50">
          <h2 className="font-semibold text-text-strong text-lg">Thiết kế & Font</h2>
        </div>
        <div className="p-5 flex-1 overflow-y-auto custom-scrollbar">
          <div className="mb-6">
            <label className="text-sm font-semibold text-text-strong mb-3 block uppercase tracking-wider text-xs">Màu chủ đạo</label>
            <div className="flex flex-wrap gap-3">
              {['#1a1a1a', '#059669', '#2563eb', '#dc2626', '#7c3aed', '#ea580c', '#0891b2', '#be123c'].map(color => (
                <button
                  key={color}
                  className={`w-10 h-10 rounded-full border-2 transition-all ${config.primaryColor === color ? 'border-neutral-900 shadow-md scale-110' : 'border-transparent hover:scale-105 shadow-sm'}`}
                  style={{ backgroundColor: color }}
                  onClick={() => onConfigChange({ ...config, primaryColor: color })}
                  aria-label={`Select color ${color}`}
                >
                  {config.primaryColor === color && <Icon name="check" size={20} className="text-white mx-auto drop-shadow-md" />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-text-strong mb-3 block uppercase tracking-wider text-xs">Font chữ (Mặc định)</label>
            <div className="p-3 border border-border-default rounded-lg bg-neutral-50 text-text-muted text-sm flex items-center justify-between">
              <span>Roboto</span>
              <Icon name="check" size={16} className="text-pine-600" />
            </div>
            <p className="text-xs text-text-muted mt-2">Hiện tại hệ thống sử dụng font Roboto tối ưu cho tiếng Việt.</p>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === "templates") {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-border-default bg-neutral-50/50">
          <h2 className="font-semibold text-text-strong text-lg">Đổi mẫu CV</h2>
        </div>
        <div className="p-5 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
          {CV_TEMPLATES.map((tpl) => (
            <div 
              key={tpl.id} 
              className={`cv-template-card ${activeTemplateId === tpl.id ? 'active' : ''}`}
              onClick={() => {
                if (activeTemplateId !== tpl.id) {
                  setTemplateToSwitch(tpl.id);
                }
              }}
            >
              <div className="aspect-[1/1.4] w-full bg-neutral-100/90 p-2.5 border border-border-default rounded-lg relative overflow-hidden group shadow-xs">
                <CvTemplateThumbnail 
                  templateId={tpl.id} 
                  primaryColor={config.primaryColor || tpl.defaultConfig.primaryColor} 
                />
                {activeTemplateId === tpl.id && (
                  <div className="absolute top-2 right-2 bg-pine-600 text-white p-1 rounded-full shadow-md z-10">
                    <Icon name="check" size={12} />
                  </div>
                )}
              </div>
              <div className="text-center mt-2 font-medium text-sm text-text-strong">{tpl.name}</div>
            </div>
          ))}
        </div>
        <ConfirmDialog
          isOpen={templateToSwitch !== null}
          title="Đổi mẫu CV"
          message="Bạn có chắc chắn muốn đổi sang mẫu CV này không? Dữ liệu hiện tại của bạn sẽ được giữ nguyên và tự động khớp với mẫu mới."
          confirmLabel="Đổi mẫu"
          cancelLabel="Hủy"
          onConfirm={() => {
            if (templateToSwitch) onChangeTemplate(templateToSwitch);
            setTemplateToSwitch(null);
          }}
          onCancel={() => setTemplateToSwitch(null)}
        />
      </div>
    );
  }

  if (activeTab === "layout") {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-border-default bg-neutral-50/50">
          <h2 className="font-semibold text-text-strong text-lg">Bố cục CV</h2>
          <p className="text-xs text-text-muted mt-1">Kéo thả hoặc dùng mũi tên để sắp xếp thứ tự các mục trong CV.</p>
        </div>
        <div className="p-4 bg-pine-50/50 border-b border-pine-100 text-[11px] text-pine-800 flex items-start gap-2">
          <Icon name="info" size={14} className="shrink-0 mt-0.5 text-pine-600" />
          <span>Mục chỉ hiển thị trên bản PDF khi đã có nội dung. Những mục chưa có thông tin sẽ tự động được ẩn đi.</span>
        </div>
        <div className="p-5 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2">
          {data.sectionOrder.map((sectionId, index) => {
            const title = SECTION_TITLES[sectionId] || sectionId;
            const isPersonal = sectionId === "personal";
            const badge = getSectionBadge(sectionId);
            const hasContent = isPersonal ? Boolean(data.personal.fullName) : Boolean(badge);
            
            return (
              <div 
                key={sectionId} 
                draggable={!isPersonal}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={() => setDraggedIndex(null)}
                className={`cv-layout-item ${isPersonal ? 'locked' : ''} ${draggedIndex === index ? 'dragging' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <Icon name={isPersonal ? "lock" : "grip-vertical"} size={16} className={`${isPersonal ? 'text-text-muted' : 'text-pine-600'}`} />
                  <div>
                    <span className="font-medium text-sm text-text-strong">{title}</span>
                    {!hasContent && !isPersonal && (
                      <span className="ml-2 text-[10px] text-text-muted italic">(Trống)</span>
                    )}
                  </div>
                </div>
                {!isPersonal && (
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => moveSection(index, "up")}
                      disabled={index === 1} // Không được vượt qua personal (index 0)
                      className="p-1.5 rounded-md hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-text-muted hover:text-pine-600"
                      title="Di chuyển lên"
                    >
                      <Icon name="arrow-up" size={14} />
                    </button>
                    <button 
                      onClick={() => moveSection(index, "down")}
                      disabled={index === data.sectionOrder.length - 1}
                      className="p-1.5 rounded-md hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-text-muted hover:text-pine-600"
                      title="Di chuyển xuống"
                    >
                      <Icon name="arrow-down" size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Content Tab (Default)
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-border-default bg-neutral-50/50">
        <h2 className="font-semibold text-text-strong text-lg">Nội dung CV</h2>
        <p className="text-xs text-text-muted mt-1">Chọn từng mục bên dưới để nhập và chỉnh sửa chi tiết.</p>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="flex flex-col divide-y divide-border-subtle">
          {data.sectionOrder.map((sectionId) => {
            const isExpanded = activeSection === sectionId;
            const title = SECTION_TITLES[sectionId] || sectionId;
            const badge = getSectionBadge(sectionId);

            return (
              <div key={sectionId} className="flex flex-col">
                <div 
                  className={`flex items-center p-4 cursor-pointer transition-colors ${isExpanded ? 'bg-pine-50/50' : 'hover:bg-neutral-50'}`}
                  onClick={() => setActiveSection(isExpanded ? "" : sectionId)}
                >
                  <div className="flex items-center justify-between w-full font-medium text-sm">
                    <div className="flex items-center gap-2">
                      <span className={isExpanded ? 'text-pine-700 font-semibold' : 'text-text-strong'}>{title}</span>
                      {badge && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-pine-100 text-pine-700">
                          {badge}
                        </span>
                      )}
                    </div>
                    <Icon name={isExpanded ? "chevron-down" : "chevron-right"} size={16} className="text-text-muted" />
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-4 pt-0 bg-white">
                    {sectionId === "personal" && (
                      <div className="grid gap-3 pt-3 border-t border-border-subtle">
                        {(() => {
                          const activeTpl = CV_TEMPLATES.find(t => t.id === activeTemplateId);
                          const hasAvatar = activeTpl ? activeTpl.hasAvatar : true;
                          return hasAvatar ? (
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-14 h-14 shrink-0 rounded-full bg-neutral-100 border border-border-default overflow-hidden flex items-center justify-center">
                                {data.personal.avatarUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={data.personal.avatarUrl} alt="Ảnh đại diện" className="w-full h-full object-cover" />
                                ) : (
                                  <Icon name="user" size={22} className="text-text-muted" />
                                )}
                              </div>
                              <div className="grid gap-1">
                                <div className="flex gap-2">
                                  <Button type="button" variant="secondary" size="sm" icon="upload" loading={uploadImage.isPending} onClick={() => avatarInputRef.current?.click()}>
                                    Tải ảnh lên
                                  </Button>
                                  {data.personal.avatarUrl ? (
                                    <Button type="button" variant="ghost" size="sm" disabled={uploadImage.isPending} onClick={() => updateSection("personal", { ...data.personal, avatarUrl: "" })}>
                                      Xoá
                                    </Button>
                                  ) : null}
                                </div>
                                <span className="text-xs text-text-muted">JPG hoặc PNG, tối đa 2MB</span>
                                {avatarError ? <span className="text-xs text-red-600">{avatarError}</span> : null}
                              </div>
                              <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handleAvatarFile} />
                            </div>
                          ) : null;
                        })()}
                        <div>
                          <label className="text-xs font-semibold text-text-muted block mb-1">Họ và tên</label>
                          <input className="w-full p-2.5 text-sm border border-border-default rounded-lg focus:outline-none focus:border-pine-500 focus:ring-1 focus:ring-pine-500" value={data.personal.fullName} onChange={(e) => updateSection("personal", { ...data.personal, fullName: e.target.value })} placeholder="VD: Nguyễn Văn A" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-text-muted block mb-1">Chức danh / Vị trí mong muốn</label>
                          <input className="w-full p-2.5 text-sm border border-border-default rounded-lg focus:outline-none focus:border-pine-500 focus:ring-1 focus:ring-pine-500" value={data.personal.headline} onChange={(e) => updateSection("personal", { ...data.personal, headline: e.target.value })} placeholder="VD: Thực tập sinh Frontend Developer" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-text-muted block mb-1">Email</label>
                          <input type="email" className="w-full p-2.5 text-sm border border-border-default rounded-lg focus:outline-none focus:border-pine-500 focus:ring-1 focus:ring-pine-500" value={data.personal.email} onChange={(e) => updateSection("personal", { ...data.personal, email: e.target.value })} placeholder="VD: nguyenvana@gmail.com" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-text-muted block mb-1">Số điện thoại</label>
                          <input type="tel" className="w-full p-2.5 text-sm border border-border-default rounded-lg focus:outline-none focus:border-pine-500 focus:ring-1 focus:ring-pine-500" value={data.personal.phone} onChange={(e) => updateSection("personal", { ...data.personal, phone: e.target.value })} placeholder="VD: 0912 345 678" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-text-muted block mb-1">Thành phố / Địa chỉ</label>
                          <input className="w-full p-2.5 text-sm border border-border-default rounded-lg focus:outline-none focus:border-pine-500 focus:ring-1 focus:ring-pine-500" value={data.personal.city} onChange={(e) => updateSection("personal", { ...data.personal, city: e.target.value })} placeholder="VD: TP. Hồ Chí Minh" />
                        </div>
                      </div>
                    )}
                    
                    {sectionId === "summary" && (
                      <div className="pt-3 border-t border-border-subtle">
                        <label className="text-xs font-semibold text-text-muted block mb-1">Giới thiệu ngắn về bản thân</label>
                        <p className="text-xs text-text-muted mb-2">Tóm tắt kinh nghiệm, thế mạnh và định hướng nghề nghiệp của bạn.</p>
                        <textarea className="w-full p-2.5 text-sm border border-border-default rounded-lg focus:outline-none focus:border-pine-500 focus:ring-1 focus:ring-pine-500 custom-scrollbar leading-relaxed" value={data.summary} onChange={(e) => updateSection("summary", e.target.value)} placeholder="VD: Sinh viên năm 4 ngành CNTT với nền tảng vững chắc về React, TypeScript và tư duy giải quyết vấn đề tốt..." rows={5} />
                      </div>
                    )}

                    {sectionId === "experiences" && (
                      <div className="grid gap-4 pt-3 border-t border-border-subtle">
                        {data.experiences.map((exp, expIdx) => (
                          <div key={exp.id} className="p-3.5 border border-border-default rounded-xl grid gap-2.5 bg-neutral-50/50">
                            <div className="flex items-center justify-between pb-1 border-b border-border-subtle">
                              <span className="text-xs font-bold text-pine-700">Kinh nghiệm #{expIdx + 1}</span>
                              <button 
                                onClick={() => {
                                  const newArr = [...data.experiences]; newArr.splice(expIdx, 1); updateSection("experiences", newArr);
                                }} 
                                className="text-text-muted hover:text-red-600 p-1 rounded-md hover:bg-red-50 transition-colors"
                                title="Xóa kinh nghiệm này"
                              >
                                <Icon name="trash-2" size={14} />
                              </button>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-text-muted block mb-1">Vị trí / Chức danh</label>
                              <input className="w-full p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500 font-medium" value={exp.position} onChange={(e) => { const newArr = [...data.experiences]; newArr[expIdx]!.position = e.target.value; updateSection("experiences", newArr); }} placeholder="VD: Thực tập sinh Frontend" />
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-text-muted block mb-1">Công ty / Tổ chức</label>
                              <input className="w-full p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500" value={exp.company} onChange={(e) => { const newArr = [...data.experiences]; newArr[expIdx]!.company = e.target.value; updateSection("experiences", newArr); }} placeholder="VD: FPT Software" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs font-semibold text-text-muted block mb-1">Bắt đầu</label>
                                <input type="date" className="w-full p-2 text-xs border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500" value={exp.startDate ? exp.startDate.slice(0, 10) : ""} onChange={(e) => { const newArr = [...data.experiences]; newArr[expIdx]!.startDate = e.target.value; updateSection("experiences", newArr); }} />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-text-muted block mb-1">Kết thúc</label>
                                <input type="date" className="w-full p-2 text-xs border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500 disabled:bg-neutral-100 disabled:text-text-muted" value={exp.endDate ? exp.endDate.slice(0, 10) : ""} onChange={(e) => { const newArr = [...data.experiences]; newArr[expIdx]!.endDate = e.target.value; updateSection("experiences", newArr); }} disabled={exp.isCurrent} />
                              </div>
                            </div>
                            <label className="flex items-center gap-2 text-xs font-medium text-text-muted cursor-pointer">
                              <input type="checkbox" className="accent-pine-600 rounded" checked={exp.isCurrent} onChange={(e) => { const newArr = [...data.experiences]; newArr[expIdx]!.isCurrent = e.target.checked; if(e.target.checked) newArr[expIdx]!.endDate = ""; updateSection("experiences", newArr); }} /> Hiện đang làm việc ở đây
                            </label>
                            <div>
                              <label className="text-xs font-semibold text-text-muted block mb-1">Mô tả công việc & Đóng góp</label>
                              <textarea className="w-full p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500 custom-scrollbar" value={exp.description} onChange={(e) => { const newArr = [...data.experiences]; newArr[expIdx]!.description = e.target.value; updateSection("experiences", newArr); }} placeholder="Mô tả các nhiệm vụ chính, công nghệ sử dụng và kết quả đạt được..." rows={3} />
                            </div>
                          </div>
                        ))}
                        <Button variant="secondary" size="sm" icon="plus" className="border-dashed border-border-strong bg-transparent hover:bg-neutral-50" onClick={() => updateSection("experiences", [...data.experiences, { id: crypto.randomUUID(), company: "", position: "", startDate: "", endDate: "", isCurrent: false, description: "" }])}>Thêm Kinh nghiệm</Button>
                      </div>
                    )}

                    {sectionId === "educations" && (
                      <div className="grid gap-4 pt-3 border-t border-border-subtle">
                        {data.educations.map((edu, eduIdx) => (
                          <div key={edu.id} className="p-3.5 border border-border-default rounded-xl grid gap-2.5 bg-neutral-50/50">
                            <div className="flex items-center justify-between pb-1 border-b border-border-subtle">
                              <span className="text-xs font-bold text-pine-700">Học vấn #{eduIdx + 1}</span>
                              <button 
                                onClick={() => {
                                  const newArr = [...data.educations]; newArr.splice(eduIdx, 1); updateSection("educations", newArr);
                                }} 
                                className="text-text-muted hover:text-red-600 p-1 rounded-md hover:bg-red-50 transition-colors"
                                title="Xóa mục này"
                              >
                                <Icon name="trash-2" size={14} />
                              </button>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-text-muted block mb-1">Trường học</label>
                              <input className="w-full p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500 font-medium" value={edu.school} onChange={(e) => { const newArr = [...data.educations]; newArr[eduIdx]!.school = e.target.value; updateSection("educations", newArr); }} placeholder="VD: Đại học Bách Khoa" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs font-semibold text-text-muted block mb-1">Ngành học</label>
                                <input className="w-full p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500" value={edu.major} onChange={(e) => { const newArr = [...data.educations]; newArr[eduIdx]!.major = e.target.value; updateSection("educations", newArr); }} placeholder="VD: Khoa học máy tính" />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-text-muted block mb-1">Bằng cấp / Hệ</label>
                                <input className="w-full p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500" value={edu.degree} onChange={(e) => { const newArr = [...data.educations]; newArr[eduIdx]!.degree = e.target.value; updateSection("educations", newArr); }} placeholder="VD: Cử nhân, Kỹ sư" />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs font-semibold text-text-muted block mb-1">Năm bắt đầu</label>
                                <input type="number" className="w-full p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500" value={edu.startYear || ""} onChange={(e) => { const newArr = [...data.educations]; newArr[eduIdx]!.startYear = parseInt(e.target.value) || 0; updateSection("educations", newArr); }} placeholder="VD: 2021" />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-text-muted block mb-1">Năm kết thúc</label>
                                <input type="number" className="w-full p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500 disabled:bg-neutral-100 disabled:text-text-muted" value={edu.endYear || ""} onChange={(e) => { const newArr = [...data.educations]; newArr[eduIdx]!.endYear = parseInt(e.target.value) || 0; updateSection("educations", newArr); }} disabled={edu.isCurrent} placeholder="VD: 2025" />
                              </div>
                            </div>
                            <label className="flex items-center gap-2 text-xs font-medium text-text-muted cursor-pointer">
                              <input type="checkbox" className="accent-pine-600 rounded" checked={edu.isCurrent} onChange={(e) => { const newArr = [...data.educations]; newArr[eduIdx]!.isCurrent = e.target.checked; updateSection("educations", newArr); }} /> Đang học tại đây
                            </label>
                            <div>
                              <label className="text-xs font-semibold text-text-muted block mb-1">Mô tả / GPA / Thành tích</label>
                              <textarea className="w-full p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500 custom-scrollbar" value={edu.description} onChange={(e) => { const newArr = [...data.educations]; newArr[eduIdx]!.description = e.target.value; updateSection("educations", newArr); }} placeholder="VD: GPA: 3.6/4.0. Đạt học bổng khuyến khích học tập..." rows={2} />
                            </div>
                          </div>
                        ))}
                        <Button variant="secondary" size="sm" icon="plus" className="border-dashed border-border-strong bg-transparent hover:bg-neutral-50" onClick={() => updateSection("educations", [...data.educations, { id: crypto.randomUUID(), school: "", major: "", degree: "", startYear: new Date().getFullYear() - 3, endYear: new Date().getFullYear() + 1, isCurrent: false, description: "" }])}>Thêm Học vấn</Button>
                      </div>
                    )}

                    {sectionId === "projects" && (
                      <div className="grid gap-4 pt-3 border-t border-border-subtle">
                        {data.projects.map((proj, projIdx) => (
                          <div key={proj.id} className="p-3.5 border border-border-default rounded-xl grid gap-2.5 bg-neutral-50/50">
                            <div className="flex items-center justify-between pb-1 border-b border-border-subtle">
                              <span className="text-xs font-bold text-pine-700">Dự án #{projIdx + 1}</span>
                              <button 
                                onClick={() => {
                                  const newArr = [...data.projects]; newArr.splice(projIdx, 1); updateSection("projects", newArr);
                                }} 
                                className="text-text-muted hover:text-red-600 p-1 rounded-md hover:bg-red-50 transition-colors"
                                title="Xóa dự án này"
                              >
                                <Icon name="trash-2" size={14} />
                              </button>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-text-muted block mb-1">Tên dự án</label>
                              <input className="w-full p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500 font-medium" value={proj.name} onChange={(e) => { const newArr = [...data.projects]; newArr[projIdx]!.name = e.target.value; updateSection("projects", newArr); }} placeholder="VD: Hệ thống thương mại điện tử E-Shop" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs font-semibold text-text-muted block mb-1">Bắt đầu</label>
                                <input type="date" className="w-full p-2 text-xs border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500" value={proj.startDate ? proj.startDate.slice(0, 10) : ""} onChange={(e) => { const newArr = [...data.projects]; newArr[projIdx]!.startDate = e.target.value; updateSection("projects", newArr); }} />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-text-muted block mb-1">Kết thúc</label>
                                <input type="date" className="w-full p-2 text-xs border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500 disabled:bg-neutral-100 disabled:text-text-muted" value={proj.endDate ? proj.endDate.slice(0, 10) : ""} onChange={(e) => { const newArr = [...data.projects]; newArr[projIdx]!.endDate = e.target.value; updateSection("projects", newArr); }} disabled={proj.isWorkingOn} />
                              </div>
                            </div>
                            <label className="flex items-center gap-2 text-xs font-medium text-text-muted cursor-pointer">
                              <input type="checkbox" className="accent-pine-600 rounded" checked={proj.isWorkingOn} onChange={(e) => { const newArr = [...data.projects]; newArr[projIdx]!.isWorkingOn = e.target.checked; if(e.target.checked) newArr[projIdx]!.endDate = ""; updateSection("projects", newArr); }} /> Đang thực hiện dự án này
                            </label>
                            <div>
                              <label className="text-xs font-semibold text-text-muted block mb-1">Mô tả dự án & Công nghệ sử dụng</label>
                              <textarea className="w-full p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500 custom-scrollbar" value={proj.description} onChange={(e) => { const newArr = [...data.projects]; newArr[projIdx]!.description = e.target.value; updateSection("projects", newArr); }} placeholder="Vai trò, công nghệ (Next.js, Node.js...) và các tính năng chính đã hoàn thành..." rows={3} />
                            </div>
                          </div>
                        ))}
                        <Button variant="secondary" size="sm" icon="plus" className="border-dashed border-border-strong bg-transparent hover:bg-neutral-50" onClick={() => updateSection("projects", [...data.projects, { id: crypto.randomUUID(), name: "", description: "", startDate: "", endDate: "", isWorkingOn: false }])}>Thêm Dự án</Button>
                      </div>
                    )}

                    {sectionId === "skills" && (
                      <div className="grid gap-3 pt-3 border-t border-border-subtle">
                        <div className="flex text-xs font-semibold text-text-muted px-1">
                          <span className="flex-1">Kỹ năng / Công nghệ</span>
                          <span className="w-24 text-center">Số năm</span>
                          <span className="w-8"></span>
                        </div>
                        {data.skills.map((sk, skIdx) => (
                          <div key={sk.id} className="flex gap-2 items-center">
                            <input className="flex-1 p-2 text-sm border border-border-default rounded-md focus:outline-none focus:border-pine-500" value={sk.name} onChange={(e) => { const newArr = [...data.skills]; newArr[skIdx]!.name = e.target.value; updateSection("skills", newArr); }} placeholder="VD: React, TypeScript" />
                            <input type="number" min={0} max={50} className="w-20 p-2 text-sm border border-border-default rounded-md focus:outline-none focus:border-pine-500 text-center" value={sk.yearsOfExperience || ""} onChange={(e) => { const newArr = [...data.skills]; newArr[skIdx]!.yearsOfExperience = parseInt(e.target.value) || 0; updateSection("skills", newArr); }} placeholder="Năm" title="Số năm kinh nghiệm" />
                            <button onClick={() => {
                              const newArr = [...data.skills]; newArr.splice(skIdx, 1); updateSection("skills", newArr);
                            }} className="text-text-muted hover:text-red-600 hover:bg-red-50 p-2 rounded-md transition-colors" title="Xóa kỹ năng này">
                              <Icon name="trash-2" size={16} />
                            </button>
                          </div>
                        ))}
                        <Button variant="secondary" size="sm" icon="plus" className="mt-1 border-dashed border-border-strong bg-transparent hover:bg-neutral-50" onClick={() => updateSection("skills", [...data.skills, { id: crypto.randomUUID(), name: "", yearsOfExperience: 1 }])}>Thêm Kỹ năng</Button>
                      </div>
                    )}

                    {sectionId === "certificates" && (
                      <div className="grid gap-4 pt-3 border-t border-border-subtle">
                        {data.certificates.map((cert, certIdx) => (
                          <div key={cert.id} className="p-3 border border-border-default rounded-xl grid gap-2.5 bg-neutral-50/50">
                            <div className="flex items-center justify-between pb-1 border-b border-border-subtle">
                              <span className="text-xs font-bold text-pine-700">Chứng chỉ #{certIdx + 1}</span>
                              <button 
                                onClick={() => {
                                  const newArr = [...data.certificates]; newArr.splice(certIdx, 1); updateSection("certificates", newArr);
                                }} 
                                className="text-text-muted hover:text-red-600 p-1 rounded-md hover:bg-red-50 transition-colors"
                                title="Xóa chứng chỉ này"
                              >
                                <Icon name="trash-2" size={14} />
                              </button>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-text-muted block mb-1">Tên chứng chỉ</label>
                              <input className="w-full p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500 font-medium" value={cert.name} onChange={(e) => { const newArr = [...data.certificates]; newArr[certIdx]!.name = e.target.value; updateSection("certificates", newArr); }} placeholder="VD: IELTS 7.5, AWS Certified Cloud Practitioner" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs font-semibold text-text-muted block mb-1">Tổ chức cấp</label>
                                <input className="w-full p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500" value={cert.issuer} onChange={(e) => { const newArr = [...data.certificates]; newArr[certIdx]!.issuer = e.target.value; updateSection("certificates", newArr); }} placeholder="VD: IDP, Amazon Web Services" />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-text-muted block mb-1">Ngày cấp</label>
                                <input type="date" className="w-full p-2 text-xs border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500" value={cert.date ? cert.date.slice(0, 10) : ""} onChange={(e) => { const newArr = [...data.certificates]; newArr[certIdx]!.date = e.target.value; updateSection("certificates", newArr); }} />
                              </div>
                            </div>
                          </div>
                        ))}
                        <Button variant="secondary" size="sm" icon="plus" className="mt-1 border-dashed border-border-strong bg-transparent hover:bg-neutral-50" onClick={() => updateSection("certificates", [...data.certificates, { id: crypto.randomUUID(), name: "", issuer: "", date: "" }])}>Thêm Chứng chỉ</Button>
                      </div>
                    )}

                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
