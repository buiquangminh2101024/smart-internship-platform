"use client";

import React from "react";

interface CvTemplateThumbnailProps {
  templateId: string;
  primaryColor?: string;
  className?: string;
}

export function CvTemplateThumbnail({
  templateId,
  primaryColor = "#059669",
  className = "",
}: CvTemplateThumbnailProps) {
  // Common paper sheet container (A4 proportion roughly 1 : 1.414) with subtle dark border and paper shadow
  const baseCardStyle = "relative w-full h-full bg-white select-none overflow-hidden text-[6px] leading-tight font-sans border border-neutral-300 shadow-sm rounded-[3px]";

  if (templateId === "classic") {
    return (
      <div className={`${baseCardStyle} p-3.5 flex flex-col ${className}`}>
        {/* Header centered */}
        <div className="flex flex-col items-center pb-2 mb-2 border-b-2" style={{ borderColor: primaryColor }}>
          <div className="h-2.5 w-24 rounded font-bold uppercase tracking-wider text-center flex items-center justify-center font-serif text-[7px]" style={{ color: primaryColor }}>
            NGUYỄN VĂN A
          </div>
          <div className="h-1.5 w-16 bg-neutral-400 rounded-sm mt-1" />
          <div className="flex gap-1.5 mt-1.5 items-center">
            <div className="h-1 w-8 bg-neutral-300 rounded-full" />
            <span className="text-[5px] text-neutral-300">•</span>
            <div className="h-1 w-10 bg-neutral-300 rounded-full" />
            <span className="text-[5px] text-neutral-300">•</span>
            <div className="h-1 w-8 bg-neutral-300 rounded-full" />
          </div>
        </div>

        {/* Section 1: Summary */}
        <div className="mb-2">
          <div className="text-[6px] font-bold uppercase pb-0.5 mb-1 border-b" style={{ color: primaryColor, borderColor: "#e5e7eb" }}>
            TÓM TẮT NGHỀ NGHIỆP
          </div>
          <div className="space-y-1">
            <div className="h-1 w-full bg-neutral-200 rounded-full" />
            <div className="h-1 w-5/6 bg-neutral-200 rounded-full" />
          </div>
        </div>

        {/* Section 2: Experience */}
        <div className="mb-2">
          <div className="text-[6px] font-bold uppercase pb-0.5 mb-1 border-b" style={{ color: primaryColor, borderColor: "#e5e7eb" }}>
            KINH NGHIỆM LÀM VIỆC
          </div>
          <div className="space-y-1.5">
            <div>
              <div className="flex justify-between items-center mb-0.5">
                <div className="h-1.5 w-20 bg-neutral-700 rounded-sm" />
                <div className="h-1 w-10 bg-neutral-300 rounded-full" />
              </div>
              <div className="h-1 w-14 bg-neutral-400 rounded-full mb-1" />
              <div className="h-1 w-11/12 bg-neutral-200 rounded-full mb-0.5" />
              <div className="h-1 w-4/5 bg-neutral-200 rounded-full" />
            </div>
            <div>
              <div className="flex justify-between items-center mb-0.5">
                <div className="h-1.5 w-16 bg-neutral-700 rounded-sm" />
                <div className="h-1 w-10 bg-neutral-300 rounded-full" />
              </div>
              <div className="h-1 w-12 bg-neutral-400 rounded-full mb-1" />
              <div className="h-1 w-10/12 bg-neutral-200 rounded-full" />
            </div>
          </div>
        </div>

        {/* Section 3: Education */}
        <div className="mb-1">
          <div className="text-[6px] font-bold uppercase pb-0.5 mb-1 border-b" style={{ color: primaryColor, borderColor: "#e5e7eb" }}>
            HỌC VẤN
          </div>
          <div className="flex justify-between items-center mb-0.5">
            <div className="h-1.5 w-24 bg-neutral-700 rounded-sm" />
            <div className="h-1 w-8 bg-neutral-300 rounded-full" />
          </div>
          <div className="h-1 w-16 bg-neutral-300 rounded-full" />
        </div>
      </div>
    );
  }

  if (templateId === "modern") {
    return (
      <div className={`${baseCardStyle} flex flex-row ${className}`}>
        {/* Left Column (35%) */}
        <div className="w-[36%] h-full p-2.5 text-white flex flex-col" style={{ backgroundColor: primaryColor }}>
          {/* Header left */}
          <div className="font-bold text-[8px] uppercase tracking-wider mb-0.5 text-white">NGUYỄN VĂN A</div>
          <div className="h-1.5 w-16 bg-white/70 rounded-sm mb-3" />

          {/* Contact */}
          <div className="text-[6px] font-bold uppercase border-b border-white/30 pb-0.5 mb-1.5">LIÊN HỆ</div>
          <div className="space-y-1 mb-3">
            <div className="h-1 w-14 bg-white/60 rounded-full" />
            <div className="h-1 w-16 bg-white/60 rounded-full" />
            <div className="h-1 w-12 bg-white/60 rounded-full" />
          </div>

          {/* Skills Badges */}
          <div className="text-[6px] font-bold uppercase border-b border-white/30 pb-0.5 mb-1.5">KỸ NĂNG</div>
          <div className="flex flex-wrap gap-1 mb-3">
            <div className="h-2 w-7 bg-white/20 rounded px-1" />
            <div className="h-2 w-8 bg-white/20 rounded px-1" />
            <div className="h-2 w-6 bg-white/20 rounded px-1" />
            <div className="h-2 w-9 bg-white/20 rounded px-1" />
          </div>

          {/* Certificates */}
          <div className="text-[6px] font-bold uppercase border-b border-white/30 pb-0.5 mb-1.5">CHỨNG CHỈ</div>
          <div className="space-y-1">
            <div className="h-1.5 w-14 bg-white/80 rounded-sm" />
            <div className="h-1 w-10 bg-white/50 rounded-full" />
          </div>
        </div>

        {/* Right Column (65%) */}
        <div className="w-[64%] h-full p-3 flex flex-col">
          {/* Summary */}
          <div className="mb-2.5">
            <div className="text-[6px] font-bold uppercase pb-0.5 mb-1 border-b" style={{ color: primaryColor, borderColor: primaryColor }}>GIỚI THIỆU</div>
            <div className="space-y-1">
              <div className="h-1 w-full bg-neutral-200 rounded-full" />
              <div className="h-1 w-4/5 bg-neutral-200 rounded-full" />
            </div>
          </div>

          {/* Experience */}
          <div className="mb-2.5">
            <div className="text-[6px] font-bold uppercase pb-0.5 mb-1 border-b" style={{ color: primaryColor, borderColor: primaryColor }}>KINH NGHIỆM</div>
            <div className="space-y-2">
              <div>
                <div className="h-1.5 w-24 bg-neutral-800 rounded-sm mb-0.5" />
                <div className="h-1 w-14 bg-neutral-400 rounded-full mb-1" />
                <div className="h-1 w-full bg-neutral-200 rounded-full mb-0.5" />
                <div className="h-1 w-3/4 bg-neutral-200 rounded-full" />
              </div>
              <div>
                <div className="h-1.5 w-20 bg-neutral-800 rounded-sm mb-0.5" />
                <div className="h-1 w-12 bg-neutral-400 rounded-full mb-1" />
                <div className="h-1 w-5/6 bg-neutral-200 rounded-full" />
              </div>
            </div>
          </div>

          {/* Education */}
          <div>
            <div className="text-[6px] font-bold uppercase pb-0.5 mb-1 border-b" style={{ color: primaryColor, borderColor: primaryColor }}>HỌC VẤN</div>
            <div className="h-1.5 w-24 bg-neutral-800 rounded-sm mb-0.5" />
            <div className="h-1 w-16 bg-neutral-300 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  if (templateId === "minimal") {
    return (
      <div className={`${baseCardStyle} p-3.5 flex flex-col ${className}`}>
        {/* Top Header */}
        <div className="flex justify-between items-baseline pb-2 mb-2 border-b border-neutral-300">
          <div>
            <div className="font-bold text-[8px] uppercase tracking-wider text-neutral-900">NGUYỄN VĂN A</div>
            <div className="h-1.5 w-16 bg-neutral-400 rounded-sm mt-0.5" />
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <div className="h-1 w-14 bg-neutral-300 rounded-full" />
            <div className="h-1 w-16 bg-neutral-300 rounded-full" />
          </div>
        </div>

        {/* Experience */}
        <div className="mb-2">
          <div className="text-[6px] font-bold uppercase tracking-wider text-neutral-800 mb-0.5">KINH NGHIỆM LÀM VIỆC</div>
          <div className="h-px bg-neutral-200 w-full mb-1" />
          <div className="space-y-1.5">
            <div>
              <div className="flex justify-between mb-0.5">
                <div className="h-1.5 w-20 bg-neutral-700 rounded-sm" />
                <div className="h-1 w-10 bg-neutral-300 rounded-full" />
              </div>
              <div className="h-1 w-14 bg-neutral-400 rounded-full mb-1" />
              <div className="h-1 w-full bg-neutral-200 rounded-full mb-0.5" />
              <div className="h-1 w-4/5 bg-neutral-200 rounded-full" />
            </div>
          </div>
        </div>

        {/* Education */}
        <div className="mb-2">
          <div className="text-[6px] font-bold uppercase tracking-wider text-neutral-800 mb-0.5">HỌC VẤN</div>
          <div className="h-px bg-neutral-200 w-full mb-1" />
          <div className="flex justify-between mb-0.5">
            <div className="h-1.5 w-24 bg-neutral-700 rounded-sm" />
            <div className="h-1 w-8 bg-neutral-300 rounded-full" />
          </div>
          <div className="h-1 w-16 bg-neutral-300 rounded-full" />
        </div>

        {/* Skills */}
        <div>
          <div className="text-[6px] font-bold uppercase tracking-wider text-neutral-800 mb-0.5">KỸ NĂNG</div>
          <div className="h-px bg-neutral-200 w-full mb-1" />
          <div className="h-1 w-5/6 bg-neutral-200 rounded-full" />
        </div>
      </div>
    );
  }

  if (templateId === "profile") {
    return (
      <div className={`${baseCardStyle} p-3 flex flex-col ${className}`}>
        {/* Center avatar header */}
        <div className="flex flex-col items-center pb-2 mb-2 border-b border-neutral-200">
          <div className="w-8 h-8 rounded-full border-2 p-0.5 mb-1 flex items-center justify-center bg-neutral-100" style={{ borderColor: primaryColor }}>
            <div className="w-full h-full rounded-full bg-neutral-300 flex items-center justify-center text-neutral-500 font-bold text-[6px]">
              AVT
            </div>
          </div>
          <div className="h-2 w-20 font-bold uppercase text-center text-[7px]" style={{ color: primaryColor }}>
            NGUYỄN VĂN A
          </div>
          <div className="h-1.5 w-16 bg-neutral-400 rounded-sm mt-0.5" />
          <div className="flex gap-1.5 mt-1">
            <div className="h-1 w-10 bg-neutral-300 rounded-full" />
            <div className="h-1 w-12 bg-neutral-300 rounded-full" />
          </div>
        </div>

        {/* Experience */}
        <div className="mb-2">
          <div className="text-[6px] font-bold uppercase pb-0.5 mb-1 border-b" style={{ color: primaryColor, borderColor: "#e5e7eb" }}>
            KINH NGHIỆM
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <div className="h-1.5 w-20 bg-neutral-700 rounded-sm" />
              <div className="h-1 w-8 bg-neutral-300 rounded-full" />
            </div>
            <div className="h-1 w-12 bg-neutral-400 rounded-full" />
            <div className="h-1 w-full bg-neutral-200 rounded-full" />
          </div>
        </div>

        {/* Education */}
        <div>
          <div className="text-[6px] font-bold uppercase pb-0.5 mb-1 border-b" style={{ color: primaryColor, borderColor: "#e5e7eb" }}>
            HỌC VẤN
          </div>
          <div className="h-1.5 w-24 bg-neutral-700 rounded-sm mb-0.5" />
          <div className="h-1 w-16 bg-neutral-300 rounded-full" />
        </div>
      </div>
    );
  }

  if (templateId === "professional") {
    return (
      <div className={`${baseCardStyle} flex flex-row ${className}`}>
        {/* Left Column (32%) */}
        <div className="w-[32%] h-full p-2 border-r border-neutral-200 bg-neutral-50 flex flex-col items-center">
          <div className="w-8 h-8 rounded-full border p-0.5 mb-2 bg-white flex items-center justify-center" style={{ borderColor: primaryColor }}>
            <div className="w-full h-full rounded-full bg-neutral-300 flex items-center justify-center text-neutral-500 font-bold text-[6px]">
              AVT
            </div>
          </div>
          <div className="w-full text-left">
            <div className="text-[6px] font-bold uppercase mb-1" style={{ color: primaryColor }}>LIÊN HỆ</div>
            <div className="space-y-1 mb-2">
              <div className="h-1 w-full bg-neutral-300 rounded-full" />
              <div className="h-1 w-5/6 bg-neutral-300 rounded-full" />
            </div>
            <div className="text-[6px] font-bold uppercase mb-1" style={{ color: primaryColor }}>KỸ NĂNG</div>
            <div className="space-y-1">
              <div className="h-1 w-10 bg-neutral-300 rounded-full" />
              <div className="h-1 w-12 bg-neutral-300 rounded-full" />
              <div className="h-1 w-9 bg-neutral-300 rounded-full" />
            </div>
          </div>
        </div>

        {/* Right Column (68%) */}
        <div className="w-[68%] h-full p-3 flex flex-col">
          <div className="pb-1.5 mb-2 border-b border-neutral-200">
            <div className="font-bold text-[8px] uppercase tracking-wider text-neutral-800">NGUYỄN VĂN A</div>
            <div className="h-1.5 w-16 bg-neutral-400 rounded-sm mt-0.5" />
          </div>
          <div className="mb-2">
            <div className="text-[6px] font-bold uppercase pb-0.5 mb-1" style={{ color: primaryColor }}>KINH NGHIỆM</div>
            <div className="h-1.5 w-24 bg-neutral-700 rounded-sm mb-0.5" />
            <div className="h-1 w-12 bg-neutral-400 rounded-full mb-1" />
            <div className="h-1 w-full bg-neutral-200 rounded-full mb-0.5" />
            <div className="h-1 w-4/5 bg-neutral-200 rounded-full" />
          </div>
          <div>
            <div className="text-[6px] font-bold uppercase pb-0.5 mb-1" style={{ color: primaryColor }}>HỌC VẤN</div>
            <div className="h-1.5 w-20 bg-neutral-700 rounded-sm mb-0.5" />
            <div className="h-1 w-14 bg-neutral-300 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  // Creative template
  return (
    <div className={`${baseCardStyle} flex flex-col ${className}`}>
      {/* Top Banner with primaryColor */}
      <div className="w-full p-2.5 text-white flex items-center gap-2" style={{ backgroundColor: primaryColor }}>
        <div className="w-8 h-8 rounded-full border-2 border-white/80 p-0.5 bg-white/20 shrink-0 flex items-center justify-center">
          <div className="w-full h-full rounded-full bg-white/40 flex items-center justify-center text-white font-bold text-[6px]">
            AVT
          </div>
        </div>
        <div>
          <div className="font-bold text-[8px] uppercase tracking-wider text-white">NGUYỄN VĂN A</div>
          <div className="h-1.5 w-16 bg-white/70 rounded-sm mt-0.5" />
        </div>
      </div>

      {/* Body */}
      <div className="p-3 flex-1 flex flex-col">
        <div className="mb-2">
          <div className="text-[6px] font-bold uppercase pb-0.5 mb-1 border-b" style={{ color: primaryColor, borderColor: "#e5e7eb" }}>
            KINH NGHIỆM
          </div>
          <div className="h-1.5 w-24 bg-neutral-700 rounded-sm mb-0.5" />
          <div className="h-1 w-12 bg-neutral-400 rounded-full mb-1" />
          <div className="h-1 w-full bg-neutral-200 rounded-full mb-0.5" />
          <div className="h-1 w-3/4 bg-neutral-200 rounded-full" />
        </div>
        <div>
          <div className="text-[6px] font-bold uppercase pb-0.5 mb-1 border-b" style={{ color: primaryColor, borderColor: "#e5e7eb" }}>
            HỌC VẤN
          </div>
          <div className="h-1.5 w-20 bg-neutral-700 rounded-sm mb-0.5" />
          <div className="h-1 w-14 bg-neutral-300 rounded-full" />
        </div>
      </div>
    </div>
  );
}
