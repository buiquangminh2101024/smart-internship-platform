"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useCandidateFullProfile, useSaveBuilderCv, useCvList } from "@/hooks/useCvs";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CV_TEMPLATES } from "./CvTemplateSelectionClient";
import { mapProfileToCvBuilderData, type CvBuilderData, type CvBuilderConfig } from "@/lib/cv-builder";
import { CvEditorForm, type EditorTab } from "./cv-builder/CvEditorForm";

const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFViewer),
  { ssr: false, loading: () => <div className="p-10 flex h-full w-full items-center justify-center text-text-muted"><Icon name="loader-circle" size={32} className="animate-spin" /></div> }
);

export function CvEditorClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateIdParam = searchParams.get("template") || "classic";
  const cvId = searchParams.get("cvId");
  const sourceParam = searchParams.get("source") || "profile";

  const { data: profile, isLoading: isLoadingProfile } = useCandidateFullProfile();
  const { data: cvs, isLoading: isLoadingCvs } = useCvList();
  const saveMutation = useSaveBuilderCv();

  const [builderData, setBuilderData] = useState<CvBuilderData | null>(null);
  const [templateConfig, setTemplateConfig] = useState<CvBuilderConfig | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState(templateIdParam);
  const [cvName, setCvName] = useState<string>("CV chưa đặt tên");
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>("content");

  const activeTemplate = CV_TEMPLATES.find(t => t.id === activeTemplateId) || CV_TEMPLATES[0]!;
  const TemplateComponent = activeTemplate.component;

  useEffect(() => {
    if (cvId && cvs) {
      const existingCv = cvs.find(c => c.id === cvId);
      if (existingCv) {
        if (existingCv.fileName) {
          setCvName(existingCv.fileName.replace(/\.pdf$/i, ""));
        }
        if (existingCv.builderData) {
          setBuilderData(existingCv.builderData.profile as CvBuilderData);
          if (existingCv.builderData.config) {
            setTemplateConfig(existingCv.builderData.config as CvBuilderConfig);
          } else {
            setTemplateConfig(activeTemplate.defaultConfig);
          }
          if (existingCv.templateId) {
            setActiveTemplateId(existingCv.templateId);
          }
        }
      }
    } else if (!cvId && profile && !builderData) {
      const initProfile = sourceParam === "blank" ? null : profile;
      setBuilderData(mapProfileToCvBuilderData(initProfile));
      setTemplateConfig(activeTemplate.defaultConfig);
      if (initProfile?.fullName) {
        setCvName(`CV - ${initProfile.fullName}`);
      }
    }
  }, [cvId, cvs, profile, builderData, activeTemplate.defaultConfig, sourceParam]);

  if (isLoadingProfile || (cvId && isLoadingCvs)) {
    return <div className="p-10 text-center text-text-muted flex justify-center items-center h-screen"><Icon name="loader-circle" size={32} className="animate-spin" /></div>;
  }

  if (!builderData || !templateConfig) {
    return <div className="p-10 text-center text-danger-600">Không thể tải dữ liệu CV.</div>;
  }

  const handleBuilderDataChange = (newData: CvBuilderData) => {
    setBuilderData(newData);
    setIsDirty(true);
  };

  const handleConfigChange = (newConfig: CvBuilderConfig) => {
    setTemplateConfig(newConfig);
    setIsDirty(true);
  };

  const handleTemplateChange = (newTemplateId: string) => {
    setActiveTemplateId(newTemplateId);
    setIsDirty(true);
  };

  const handleBackClick = () => {
    if (isDirty) {
      setShowExitConfirm(true);
    } else {
      router.push("/cv");
    }
  };

  async function handleSaveCv() {
    setIsGenerating(true);
    setErrorMsg("");

    try {
      const { pdf } = await import("@react-pdf/renderer");
      const blob = await pdf(<TemplateComponent data={builderData!} config={templateConfig!} />).toBlob();
      const finalFileName = `${cvName.trim() || 'CV chua dat ten'}.pdf`;
      const file = new File([blob], finalFileName, { type: "application/pdf" });

      const fullBuilderData = { profile: builderData, config: templateConfig };

      const payload: any = {
        templateId: activeTemplateId,
        builderData: fullBuilderData,
        file
      };
      if (cvId) payload.cvId = cvId;

      await saveMutation.mutateAsync(payload);
      
      setIsDirty(false);
      router.push("/cv");
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "Đã xảy ra lỗi khi lưu CV.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex flex-col h-screen w-full bg-neutral-100 overflow-hidden">
      {/* Top Header */}
      <header className="h-[60px] bg-white border-b border-border-default flex items-center justify-between px-4 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBackClick} className="-ml-2">
            <Icon name="arrow-left" size={18} />
          </Button>
          <div className="flex items-center gap-2">
            <Icon name="file-text" size={18} className="text-pine-600" />
            <div className="relative group flex items-center">
              <input 
                type="text" 
                value={cvName}
                onChange={(e) => {
                  setCvName(e.target.value);
                  setIsDirty(true);
                }}
                className="text-base font-bold text-text-strong bg-transparent border-none outline-none focus:ring-2 focus:ring-pine-500/50 rounded px-1 -ml-1 hover:bg-neutral-100 transition-colors w-64 h-8"
                placeholder="CV chưa đặt tên"
                title="Nhấp để đổi tên CV"
              />
              <Icon name="pencil" size={14} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
            </div>
            {isDirty && <span className="w-2 h-2 rounded-full bg-yellow-500 ml-1" title="Có thay đổi chưa lưu" />}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {errorMsg && <span className="text-sm text-red-600 font-medium">{errorMsg}</span>}
          <Button 
            variant="primary" 
            size="sm"
            icon="save" 
            onClick={handleSaveCv} 
            loading={isGenerating || saveMutation.isPending}
          >
            Lưu CV
          </Button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden h-[calc(100vh-60px)]">
        
        {/* Outer Sidebar (Tab Menu) */}
        <div className="w-[100px] shrink-0 bg-white border-r border-border-default flex flex-col items-center py-6 gap-2 z-10 shadow-sm">
          <button className={`cv-tab-btn ${activeTab === 'design' ? 'active' : ''}`} onClick={() => setActiveTab('design')}>
            <Icon name="palette" size={22} />
            <span className="text-[10px] text-center w-full leading-tight">Thiết kế<br/>& Font</span>
          </button>
          
          <button className={`cv-tab-btn ${activeTab === 'content' ? 'active' : ''}`} onClick={() => setActiveTab('content')}>
            <Icon name="plus-square" size={22} />
            <span className="text-[10px] text-center w-full leading-tight">Thêm mục</span>
          </button>
          
          <button className={`cv-tab-btn ${activeTab === 'layout' ? 'active' : ''}`} onClick={() => setActiveTab('layout')}>
            <Icon name="layout-grid" size={22} />
            <span className="text-[10px] text-center w-full leading-tight">Bố cục</span>
          </button>
          
          <button className={`cv-tab-btn ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>
            <Icon name="layout-template" size={22} />
            <span className="text-[10px] text-center w-full leading-tight">Đổi mẫu<br/>CV</span>
          </button>
        </div>

        {/* Inner Sidebar (Tab Content) */}
        <div className="w-[360px] shrink-0 bg-white border-r border-border-default flex flex-col h-full shadow-sm z-0 relative overflow-hidden">
          <CvEditorForm 
            data={builderData}
            onChange={handleBuilderDataChange}
            config={templateConfig}
            onConfigChange={handleConfigChange}
            activeTemplateId={activeTemplateId}
            onChangeTemplate={handleTemplateChange}
            activeTab={activeTab}
          />
        </div>

        {/* PDF Preview */}
        <div className="flex-1 bg-neutral-200/50 flex flex-col h-full overflow-hidden relative">
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-green-100 text-green-700 px-4 py-2 rounded-full text-xs font-medium flex items-center gap-2 shadow-sm z-10 pointer-events-none opacity-80">
            <Icon name="info" size={14} />
            Gợi ý: Trực tiếp thay đổi thông tin tại thanh menu bên trái
          </div>
          <PDFViewer className="w-full h-full border-none" showToolbar={true}>
            <TemplateComponent data={builderData} config={templateConfig} />
          </PDFViewer>
        </div>

      </div>

      <ConfirmDialog
        isOpen={showExitConfirm}
        title="Bạn có muốn lưu CV không?"
        message="CV của bạn có những thay đổi chưa được lưu. Nếu bạn rời đi bây giờ, các thay đổi sẽ bị mất."
        confirmLabel="Lưu & Thoát"
        cancelLabel="Thoát không lưu"
        isConfirming={isGenerating || saveMutation.isPending}
        onConfirm={handleSaveCv}
        onCancel={() => router.push("/cv")}
      />
    </div>
  );
}
