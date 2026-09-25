import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { CvBuilderData, CvBuilderConfig } from "@/lib/cv-builder";
import { CV_TEMPLATES } from "../CvTemplateSelectionClient";

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

  const updateSection = (sectionKey: keyof CvBuilderData, value: any) => {
    onChange({ ...data, [sectionKey]: value });
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
              <div className="aspect-[1/1.4] w-full bg-white border border-border-default rounded-lg flex flex-col items-center justify-center relative overflow-hidden group">
                <Icon name="file-text" size={48} className="text-neutral-200" />
                <span className="text-sm font-medium text-neutral-400 mt-2">{tpl.name}</span>
                {activeTemplateId === tpl.id && (
                  <div className="absolute top-2 right-2 bg-pine-600 text-white p-1 rounded-full shadow-sm">
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
          <p className="text-xs text-text-muted mt-1">Thay đổi thứ tự hiển thị của các mục trong CV.</p>
        </div>
        <div className="p-5 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2">
          {data.sectionOrder.map((sectionId, index) => {
            const title = SECTION_TITLES[sectionId] || sectionId;
            // Thông tin cá nhân thường cố định ở đầu tuỳ template, nhưng ta cứ cho phép hiển thị
            const isPersonal = sectionId === "personal";
            
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
                  <span className="font-medium text-sm text-text-strong">{title}</span>
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
        <h2 className="font-semibold text-text-strong text-lg">Thêm mục (Nội dung)</h2>
        <p className="text-xs text-text-muted mt-1">Click vào từng mục để chỉnh sửa nội dung chi tiết.</p>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="flex flex-col divide-y divide-border-subtle">
          {data.sectionOrder.map((sectionId) => {
            const isExpanded = activeSection === sectionId;
            const title = SECTION_TITLES[sectionId] || sectionId;

            return (
              <div key={sectionId} className="flex flex-col">
                <div 
                  className={`flex items-center p-4 cursor-pointer transition-colors ${isExpanded ? 'bg-pine-50/50' : 'hover:bg-neutral-50'}`}
                  onClick={() => setActiveSection(isExpanded ? "" : sectionId)}
                >
                  <div className={`flex items-center justify-between w-full font-medium text-sm ${isExpanded ? 'text-pine-700' : 'text-text-strong'}`}>
                    {title}
                    <Icon name={isExpanded ? "chevron-down" : "chevron-right"} size={16} className="text-text-muted" />
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-4 pt-0 bg-white">
                    {sectionId === "personal" && (
                      <div className="grid gap-3 pt-3 border-t border-border-subtle">
                        <input className="w-full p-2.5 text-sm border border-border-default rounded-lg focus:outline-none focus:border-pine-500 focus:ring-1 focus:ring-pine-500" value={data.personal.fullName} onChange={(e) => updateSection("personal", { ...data.personal, fullName: e.target.value })} placeholder="Họ và tên" />
                        <input className="w-full p-2.5 text-sm border border-border-default rounded-lg focus:outline-none focus:border-pine-500 focus:ring-1 focus:ring-pine-500" value={data.personal.headline} onChange={(e) => updateSection("personal", { ...data.personal, headline: e.target.value })} placeholder="Tiêu đề nghề nghiệp" />
                        <input className="w-full p-2.5 text-sm border border-border-default rounded-lg focus:outline-none focus:border-pine-500 focus:ring-1 focus:ring-pine-500" value={data.personal.email} onChange={(e) => updateSection("personal", { ...data.personal, email: e.target.value })} placeholder="Email" />
                        <input className="w-full p-2.5 text-sm border border-border-default rounded-lg focus:outline-none focus:border-pine-500 focus:ring-1 focus:ring-pine-500" value={data.personal.phone} onChange={(e) => updateSection("personal", { ...data.personal, phone: e.target.value })} placeholder="Số điện thoại" />
                        <input className="w-full p-2.5 text-sm border border-border-default rounded-lg focus:outline-none focus:border-pine-500 focus:ring-1 focus:ring-pine-500" value={data.personal.city} onChange={(e) => updateSection("personal", { ...data.personal, city: e.target.value })} placeholder="Thành phố/Địa chỉ" />
                        <input className="w-full p-2.5 text-sm border border-border-default rounded-lg focus:outline-none focus:border-pine-500 focus:ring-1 focus:ring-pine-500" value={data.personal.avatarUrl || ""} onChange={(e) => updateSection("personal", { ...data.personal, avatarUrl: e.target.value })} placeholder="Đường dẫn ảnh đại diện (URL)" title="Nhập link ảnh (VD: https://i.imgur.com/...)" />
                      </div>
                    )}
                    
                    {sectionId === "summary" && (
                      <div className="pt-3 border-t border-border-subtle">
                        <textarea className="w-full p-2.5 text-sm border border-border-default rounded-lg focus:outline-none focus:border-pine-500 focus:ring-1 focus:ring-pine-500 custom-scrollbar" value={data.summary} onChange={(e) => updateSection("summary", e.target.value)} placeholder="Tóm tắt bản thân / Mục tiêu nghề nghiệp" rows={5} />
                      </div>
                    )}

                    {sectionId === "experiences" && (
                      <div className="grid gap-4 pt-3 border-t border-border-subtle">
                        {data.experiences.map((exp, expIdx) => (
                          <div key={exp.id} className="p-4 border border-border-default rounded-xl grid gap-3 relative group bg-neutral-50/30">
                            <button onClick={() => {
                              const newArr = [...data.experiences]; newArr.splice(expIdx, 1); updateSection("experiences", newArr);
                            }} className="absolute -top-3 -right-3 text-red-500 bg-white border border-red-100 shadow-sm p-1.5 hover:bg-red-50 rounded-full transition-transform hover:scale-110">
                              <Icon name="trash-2" size={14} />
                            </button>
                            <input className="w-full p-2 text-sm border-b border-border-default bg-transparent focus:outline-none focus:border-pine-500 font-medium" value={exp.position} onChange={(e) => { const newArr = [...data.experiences]; newArr[expIdx]!.position = e.target.value; updateSection("experiences", newArr); }} placeholder="Vị trí / Chức danh" />
                            <input className="w-full p-2 text-sm border-b border-border-default bg-transparent focus:outline-none focus:border-pine-500" value={exp.company} onChange={(e) => { const newArr = [...data.experiences]; newArr[expIdx]!.company = e.target.value; updateSection("experiences", newArr); }} placeholder="Công ty" />
                            <div className="flex gap-3 mt-1">
                              <input type="date" className="w-1/2 p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500 text-text-muted" value={exp.startDate ? exp.startDate.slice(0, 10) : ""} onChange={(e) => { const newArr = [...data.experiences]; newArr[expIdx]!.startDate = e.target.value; updateSection("experiences", newArr); }} />
                              <input type="date" className="w-1/2 p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500 text-text-muted" value={exp.endDate ? exp.endDate.slice(0, 10) : ""} onChange={(e) => { const newArr = [...data.experiences]; newArr[expIdx]!.endDate = e.target.value; updateSection("experiences", newArr); }} disabled={exp.isCurrent} />
                            </div>
                            <label className="flex items-center gap-2 text-xs font-medium text-text-muted cursor-pointer">
                              <input type="checkbox" className="accent-pine-600 rounded" checked={exp.isCurrent} onChange={(e) => { const newArr = [...data.experiences]; newArr[expIdx]!.isCurrent = e.target.checked; if(e.target.checked) newArr[expIdx]!.endDate = ""; updateSection("experiences", newArr); }} /> Hiện đang làm việc
                            </label>
                            <textarea className="w-full p-2.5 text-sm border border-border-default rounded-lg bg-white mt-1 focus:outline-none focus:border-pine-500 focus:ring-1 focus:ring-pine-500 custom-scrollbar" value={exp.description} onChange={(e) => { const newArr = [...data.experiences]; newArr[expIdx]!.description = e.target.value; updateSection("experiences", newArr); }} placeholder="Mô tả công việc" rows={3} />
                          </div>
                        ))}
                        <Button variant="secondary" size="sm" icon="plus" className="border-dashed border-border-strong bg-transparent hover:bg-neutral-50" onClick={() => updateSection("experiences", [...data.experiences, { id: crypto.randomUUID(), company: "", position: "", startDate: "", endDate: "", isCurrent: false, description: "" }])}>Thêm Kinh nghiệm</Button>
                      </div>
                    )}

                    {sectionId === "educations" && (
                      <div className="grid gap-4 pt-3 border-t border-border-subtle">
                        {data.educations.map((edu, eduIdx) => (
                          <div key={edu.id} className="p-4 border border-border-default rounded-xl grid gap-3 relative group bg-neutral-50/30">
                            <button onClick={() => {
                              const newArr = [...data.educations]; newArr.splice(eduIdx, 1); updateSection("educations", newArr);
                            }} className="absolute -top-3 -right-3 text-red-500 bg-white border border-red-100 shadow-sm p-1.5 hover:bg-red-50 rounded-full transition-transform hover:scale-110">
                              <Icon name="trash-2" size={14} />
                            </button>
                            <input className="w-full p-2 text-sm border-b border-border-default bg-transparent focus:outline-none focus:border-pine-500 font-medium" value={edu.school} onChange={(e) => { const newArr = [...data.educations]; newArr[eduIdx]!.school = e.target.value; updateSection("educations", newArr); }} placeholder="Trường học" />
                            <div className="flex gap-3">
                              <input className="w-1/2 p-2 text-sm border-b border-border-default bg-transparent focus:outline-none focus:border-pine-500" value={edu.major} onChange={(e) => { const newArr = [...data.educations]; newArr[eduIdx]!.major = e.target.value; updateSection("educations", newArr); }} placeholder="Ngành học" />
                              <input className="w-1/2 p-2 text-sm border-b border-border-default bg-transparent focus:outline-none focus:border-pine-500" value={edu.degree} onChange={(e) => { const newArr = [...data.educations]; newArr[eduIdx]!.degree = e.target.value; updateSection("educations", newArr); }} placeholder="Bằng cấp" />
                            </div>
                            <div className="flex gap-3 mt-1">
                              <input type="number" className="w-1/2 p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500" value={edu.startYear} onChange={(e) => { const newArr = [...data.educations]; newArr[eduIdx]!.startYear = parseInt(e.target.value) || 0; updateSection("educations", newArr); }} placeholder="Năm bắt đầu" />
                              <input type="number" className="w-1/2 p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500" value={edu.endYear} onChange={(e) => { const newArr = [...data.educations]; newArr[eduIdx]!.endYear = parseInt(e.target.value) || 0; updateSection("educations", newArr); }} disabled={edu.isCurrent} placeholder="Năm kết thúc" />
                            </div>
                            <label className="flex items-center gap-2 text-xs font-medium text-text-muted cursor-pointer">
                              <input type="checkbox" className="accent-pine-600 rounded" checked={edu.isCurrent} onChange={(e) => { const newArr = [...data.educations]; newArr[eduIdx]!.isCurrent = e.target.checked; updateSection("educations", newArr); }} /> Đang học
                            </label>
                            <textarea className="w-full p-2.5 text-sm border border-border-default rounded-lg bg-white mt-1 focus:outline-none focus:border-pine-500 focus:ring-1 focus:ring-pine-500 custom-scrollbar" value={edu.description} onChange={(e) => { const newArr = [...data.educations]; newArr[eduIdx]!.description = e.target.value; updateSection("educations", newArr); }} placeholder="Mô tả / Thành tích" rows={2} />
                          </div>
                        ))}
                        <Button variant="secondary" size="sm" icon="plus" className="border-dashed border-border-strong bg-transparent hover:bg-neutral-50" onClick={() => updateSection("educations", [...data.educations, { id: crypto.randomUUID(), school: "", major: "", degree: "", startYear: new Date().getFullYear(), endYear: new Date().getFullYear(), isCurrent: false, description: "" }])}>Thêm Học vấn</Button>
                      </div>
                    )}

                    {sectionId === "projects" && (
                      <div className="grid gap-4 pt-3 border-t border-border-subtle">
                        {data.projects.map((proj, projIdx) => (
                          <div key={proj.id} className="p-4 border border-border-default rounded-xl grid gap-3 relative group bg-neutral-50/30">
                            <button onClick={() => {
                              const newArr = [...data.projects]; newArr.splice(projIdx, 1); updateSection("projects", newArr);
                            }} className="absolute -top-3 -right-3 text-red-500 bg-white border border-red-100 shadow-sm p-1.5 hover:bg-red-50 rounded-full transition-transform hover:scale-110">
                              <Icon name="trash-2" size={14} />
                            </button>
                            <input className="w-full p-2 text-sm border-b border-border-default bg-transparent focus:outline-none focus:border-pine-500 font-medium" value={proj.name} onChange={(e) => { const newArr = [...data.projects]; newArr[projIdx]!.name = e.target.value; updateSection("projects", newArr); }} placeholder="Tên dự án" />
                            <div className="flex gap-3 mt-1">
                              <input type="date" className="w-1/2 p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500 text-text-muted" value={proj.startDate ? proj.startDate.slice(0, 10) : ""} onChange={(e) => { const newArr = [...data.projects]; newArr[projIdx]!.startDate = e.target.value; updateSection("projects", newArr); }} />
                              <input type="date" className="w-1/2 p-2 text-sm border border-border-default rounded-md bg-white focus:outline-none focus:border-pine-500 text-text-muted" value={proj.endDate ? proj.endDate.slice(0, 10) : ""} onChange={(e) => { const newArr = [...data.projects]; newArr[projIdx]!.endDate = e.target.value; updateSection("projects", newArr); }} disabled={proj.isWorkingOn} />
                            </div>
                            <label className="flex items-center gap-2 text-xs font-medium text-text-muted cursor-pointer">
                              <input type="checkbox" className="accent-pine-600 rounded" checked={proj.isWorkingOn} onChange={(e) => { const newArr = [...data.projects]; newArr[projIdx]!.isWorkingOn = e.target.checked; if(e.target.checked) newArr[projIdx]!.endDate = ""; updateSection("projects", newArr); }} /> Đang thực hiện
                            </label>
                            <textarea className="w-full p-2.5 text-sm border border-border-default rounded-lg bg-white mt-1 focus:outline-none focus:border-pine-500 focus:ring-1 focus:ring-pine-500 custom-scrollbar" value={proj.description} onChange={(e) => { const newArr = [...data.projects]; newArr[projIdx]!.description = e.target.value; updateSection("projects", newArr); }} placeholder="Mô tả dự án" rows={3} />
                          </div>
                        ))}
                        <Button variant="secondary" size="sm" icon="plus" className="border-dashed border-border-strong bg-transparent hover:bg-neutral-50" onClick={() => updateSection("projects", [...data.projects, { id: crypto.randomUUID(), name: "", description: "", startDate: "", endDate: "", isWorkingOn: false }])}>Thêm Dự án</Button>
                      </div>
                    )}

                    {sectionId === "skills" && (
                      <div className="grid gap-3 pt-3 border-t border-border-subtle">
                        {data.skills.map((sk, skIdx) => (
                          <div key={sk.id} className="flex gap-2 items-center">
                            <input className="flex-1 p-2 text-sm border border-border-default rounded-md focus:outline-none focus:border-pine-500" value={sk.name} onChange={(e) => { const newArr = [...data.skills]; newArr[skIdx]!.name = e.target.value; updateSection("skills", newArr); }} placeholder="Tên kỹ năng" />
                            <input type="number" className="w-20 p-2 text-sm border border-border-default rounded-md focus:outline-none focus:border-pine-500 text-center" value={sk.yearsOfExperience} onChange={(e) => { const newArr = [...data.skills]; newArr[skIdx]!.yearsOfExperience = parseInt(e.target.value) || 0; updateSection("skills", newArr); }} placeholder="Năm" title="Số năm kinh nghiệm" />
                            <button onClick={() => {
                              const newArr = [...data.skills]; newArr.splice(skIdx, 1); updateSection("skills", newArr);
                            }} className="text-red-500 hover:bg-red-50 p-2 rounded-md transition-colors">
                              <Icon name="trash-2" size={16} />
                            </button>
                          </div>
                        ))}
                        <Button variant="secondary" size="sm" icon="plus" className="mt-1 border-dashed border-border-strong bg-transparent hover:bg-neutral-50" onClick={() => updateSection("skills", [...data.skills, { id: crypto.randomUUID(), name: "", yearsOfExperience: 0 }])}>Thêm Kỹ năng</Button>
                      </div>
                    )}

                    {sectionId === "certificates" && (
                      <div className="grid gap-4 pt-3 border-t border-border-subtle">
                        {data.certificates.map((cert, certIdx) => (
                          <div key={cert.id} className="p-3 border border-border-default rounded-xl grid gap-2 relative group bg-neutral-50/30">
                            <button onClick={() => {
                              const newArr = [...data.certificates]; newArr.splice(certIdx, 1); updateSection("certificates", newArr);
                            }} className="absolute -top-2 -right-2 text-red-500 bg-white border border-red-100 shadow-sm p-1 hover:bg-red-50 rounded-full transition-transform hover:scale-110">
                              <Icon name="trash-2" size={12} />
                            </button>
                            <input className="w-full p-2 text-sm border-b border-border-default bg-transparent focus:outline-none focus:border-pine-500 font-medium" value={cert.name} onChange={(e) => { const newArr = [...data.certificates]; newArr[certIdx]!.name = e.target.value; updateSection("certificates", newArr); }} placeholder="Tên chứng chỉ" />
                            <div className="flex gap-2 mt-1">
                              <input className="w-1/2 p-2 text-sm border border-border-default rounded-md focus:outline-none focus:border-pine-500" value={cert.issuer} onChange={(e) => { const newArr = [...data.certificates]; newArr[certIdx]!.issuer = e.target.value; updateSection("certificates", newArr); }} placeholder="Tổ chức cấp" />
                              <input type="date" className="w-1/2 p-2 text-sm border border-border-default rounded-md focus:outline-none focus:border-pine-500 text-text-muted" value={cert.date ? cert.date.slice(0, 10) : ""} onChange={(e) => { const newArr = [...data.certificates]; newArr[certIdx]!.date = e.target.value; updateSection("certificates", newArr); }} />
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
