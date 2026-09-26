"use client";

import { useParams, useRouter } from "next/navigation";
import { useEmployerCandidateProfile } from "@/hooks/useEmployerCandidateProfile";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";

export default function EmployerCandidateProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const { data: profile, isLoading, isError } = useEmployerCandidateProfile(id);

  if (isLoading) return <div className="p-10 text-text-muted">Đang tải hồ sơ ứng viên...</div>;
  if (isError || !profile) return <div className="p-10 text-danger-600">Không thể tải hồ sơ ứng viên. Vui lòng thử lại sau.</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="secondary" onClick={() => router.back()}>Quay lại</Button>
        <h1 className="text-2xl font-bold text-text-strong">Hồ sơ Ứng viên</h1>
      </div>

      <Card padding="lg" className="grid gap-6">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="w-24 h-24 bg-surface-page rounded-full flex items-center justify-center shrink-0 border border-neutral-200 overflow-hidden">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <Icon name="user" size={40} className="text-neutral-400" />
            )}
          </div>
          
          <div className="flex-1 space-y-2">
            <h2 className="text-2xl font-bold">{profile.fullName || profile.user?.email}</h2>
            {profile.headline && <p className="text-lg text-text-body font-medium">{profile.headline}</p>}
            
            <div className="flex flex-wrap gap-4 text-sm text-text-muted mt-2">
              {profile.city && (
                <div className="flex items-center gap-1.5">
                  <Icon name="map-pin" size={16} />
                  <span>{profile.city.name}</span>
                </div>
              )}
              {profile.phone && (
                <div className="flex items-center gap-1.5">
                  <Icon name="phone" size={16} />
                  <span>{profile.phone}</span>
                </div>
              )}
              {profile.gender && (
                <div className="flex items-center gap-1.5">
                  <Icon name="user" size={16} />
                  <span>{profile.gender === "MALE" ? "Nam" : profile.gender === "FEMALE" ? "Nữ" : "Khác"}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {profile.bio && (
          <div className="pt-4 border-t border-neutral-100">
            <h3 className="font-semibold text-text-strong mb-2 flex items-center gap-2">
              <Icon name="file-text" size={18} className="text-pine-600" /> Giới thiệu bản thân
            </h3>
            <p className="text-text-body whitespace-pre-wrap">{profile.bio}</p>
          </div>
        )}
      </Card>

      {profile.skills && profile.skills.length > 0 && (
        <Card padding="lg">
          <h3 className="font-semibold text-text-strong mb-4 flex items-center gap-2">
            <Icon name="sparkles" size={18} className="text-pine-600" /> Kỹ năng
          </h3>
          <div className="flex flex-wrap gap-2">
            {profile.skills.map((s: any) => (
              <Badge key={s.skill.id} tone="brand">
                {s.skill.name} {s.yearsOfExperience > 0 ? `· ${s.yearsOfExperience} năm` : ""}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {profile.workExperiences && profile.workExperiences.length > 0 && (
        <Card padding="lg">
          <h3 className="font-semibold text-text-strong mb-4 flex items-center gap-2">
            <Icon name="briefcase" size={18} className="text-pine-600" /> Kinh nghiệm làm việc
          </h3>
          <div className="space-y-6">
            {profile.workExperiences.map((exp: any) => (
              <div key={exp.id} className="grid gap-1">
                <h4 className="font-bold text-text-strong">{exp.position} tại {exp.company}</h4>
                <p className="text-sm text-text-muted">
                  {exp.startDate ? new Date(exp.startDate).toLocaleDateString("vi-VN") : "Không rõ"} - {exp.isCurrent ? "Hiện tại" : exp.endDate ? new Date(exp.endDate).toLocaleDateString("vi-VN") : "Không rõ"}
                </p>
                {exp.description && <p className="text-sm mt-2 whitespace-pre-wrap">{exp.description}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {profile.educations && profile.educations.length > 0 && (
        <Card padding="lg">
          <h3 className="font-semibold text-text-strong mb-4 flex items-center gap-2">
            <Icon name="graduation-cap" size={18} className="text-pine-600" /> Học vấn
          </h3>
          <div className="space-y-6">
            {profile.educations.map((edu: any) => (
              <div key={edu.id} className="grid gap-1">
                <h4 className="font-bold text-text-strong">{edu.university?.name || "Trường khác"}</h4>
                <p className="text-sm font-medium">{edu.major?.name || "Ngành khác"} {edu.degree ? `· ${edu.degree}` : ""}</p>
                <p className="text-sm text-text-muted">
                  {edu.startYear || "Không rõ"} - {edu.isCurrent ? "Hiện tại" : edu.endYear || "Không rõ"}
                </p>
                {edu.description && <p className="text-sm mt-2 whitespace-pre-wrap">{edu.description}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {profile.projects && profile.projects.length > 0 && (
        <Card padding="lg">
          <h3 className="font-semibold text-text-strong mb-4 flex items-center gap-2">
            <Icon name="folder-git-2" size={18} className="text-pine-600" /> Dự án
          </h3>
          <div className="space-y-6">
            {profile.projects.map((proj: any) => (
              <div key={proj.id} className="grid gap-1">
                <h4 className="font-bold text-text-strong">
                  {proj.name}
                  {proj.url && (
                    <a href={proj.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-pine-600 hover:underline text-sm font-normal">
                      [Link dự án]
                    </a>
                  )}
                </h4>
                <p className="text-sm text-text-muted">
                  {proj.startDate ? new Date(proj.startDate).toLocaleDateString("vi-VN") : "Không rõ"} - {proj.isWorkingOn ? "Hiện tại" : proj.endDate ? new Date(proj.endDate).toLocaleDateString("vi-VN") : "Không rõ"}
                </p>
                {proj.description && <p className="text-sm mt-2 whitespace-pre-wrap">{proj.description}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}
      
      {((profile.certificates && profile.certificates.length > 0) || (profile.awards && profile.awards.length > 0)) && (
        <Card padding="lg">
          <h3 className="font-semibold text-text-strong mb-4 flex items-center gap-2">
            <Icon name="award" size={18} className="text-pine-600" /> Chứng chỉ & Giải thưởng
          </h3>
          
          {profile.certificates && profile.certificates.length > 0 && (
            <div className="space-y-4 mb-6">
              {profile.certificates.map((cert: any) => (
                <div key={cert.id}>
                  <h4 className="font-bold">{cert.name}</h4>
                  <p className="text-sm text-text-muted">{cert.issuer} · {cert.issueDate ? new Date(cert.issueDate).toLocaleDateString("vi-VN") : ""}</p>
                </div>
              ))}
            </div>
          )}
          
          {profile.awards && profile.awards.length > 0 && (
            <div className="space-y-4">
              {profile.awards.map((award: any) => (
                <div key={award.id}>
                  <h4 className="font-bold">{award.name}</h4>
                  <p className="text-sm text-text-muted">{award.issuer} · {award.date ? new Date(award.date).toLocaleDateString("vi-VN") : ""}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

    </div>
  );
}
