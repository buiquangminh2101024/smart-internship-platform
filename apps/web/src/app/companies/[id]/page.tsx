"use client";

import { useParams, useRouter } from "next/navigation";
import { usePublicCompany } from "@/hooks/useCompany";
import { usePublicJobPosts } from "@/hooks/useJobPosts";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { CandidateHomeHeader } from "@/components/marketing/CandidateHomeHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { JobCard } from "@/components/ui/JobCard";
import { JOB_TYPE_LABEL, formatDeadline, formatSalary } from "@/lib/job-post-display";
import Link from "next/link";

export default function CompanyProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: company, isLoading, isError } = usePublicCompany(id);
  const { data: jobPosts, isLoading: isLoadingJobs } = usePublicJobPosts({ companyId: id });

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-surface-background">
        <CandidateHomeHeader />
        <main className="flex-1 p-10 text-center text-text-muted">Đang tải thông tin công ty...</main>
        <SiteFooter />
      </div>
    );
  }

  if (isError || !company) {
    return (
      <div className="flex min-h-screen flex-col bg-surface-background">
        <CandidateHomeHeader />
        <main className="flex-1 p-10 text-center text-danger-600">
          Không thể tải thông tin công ty hoặc công ty chưa được xác minh.
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-background">
      <CandidateHomeHeader />
      
      <main className="flex-1 px-4 py-8 max-w-5xl mx-auto w-full space-y-8">
        <div>
          <Button variant="secondary" onClick={() => router.back()} className="mb-4">Quay lại</Button>
          
          <Card padding="none" className="overflow-hidden">
            <div className="h-48 bg-neutral-200 relative">
              {company.bannerUrl && (
                <img src={company.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
              )}
            </div>
            <div className="px-8 pb-8 relative">
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="w-32 h-32 bg-white rounded-xl border-4 border-white shadow-sm -mt-12 overflow-hidden shrink-0 flex items-center justify-center relative z-10">
                  {company.logoUrl ? (
                    <img src={company.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-4xl font-bold text-neutral-400">{company.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                
                <div className="flex-1 mt-4 md:mt-0 pt-4 md:pt-6">
                  <h1 className="text-3xl font-bold text-text-strong mb-2 flex items-center gap-2">
                    {company.name}
                    {company.isVerified && <Icon name="badge-check" size={24} className="text-pine-600" />}
                  </h1>
                  
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-muted">
                    {company.website && (
                      <a href={company.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-pine-600">
                        <Icon name="globe" size={16} /> Website
                      </a>
                    )}
                    {company.foundedYear && (
                      <span className="flex items-center gap-1.5">
                        <Icon name="calendar" size={16} /> Thành lập {company.foundedYear}
                      </span>
                    )}
                    {company.address && (
                      <span className="flex items-center gap-1.5">
                        <Icon name="map-pin" size={16} /> {company.address}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {company.description && (
                <div className="mt-8 border-t border-neutral-100 pt-6">
                  <h2 className="text-xl font-bold text-text-strong mb-4">Giới thiệu công ty</h2>
                  <p className="text-text-body whitespace-pre-wrap">{company.description}</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-text-strong mb-6 flex items-center gap-2">
            <Icon name="briefcase" size={24} className="text-pine-600" /> Tuyển dụng ({jobPosts?.items.length || 0})
          </h2>
          
          {isLoadingJobs ? (
            <div className="text-text-muted">Đang tải danh sách việc làm...</div>
          ) : jobPosts && jobPosts.items.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {jobPosts.items.map(job => (
                <div key={job.id} className="block h-full cursor-pointer hover:border-pine-300 transition-colors border border-transparent rounded-xl">
                  <JobCard
                    title={job.title}
                    company={job.company.name}
                    verified={job.company.isVerified}
                    location={job.cityName ?? job.address ?? undefined}
                    salary={formatSalary(job)}
                    deadline={formatDeadline(job.expiresAt)}
                    tags={[JOB_TYPE_LABEL[job.jobType], ...(job.industryName ? [job.industryName] : [])]}
                    onClick={() => router.push(`/jobs/${job.id}`)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <Card padding="lg" className="text-center text-text-muted">
              Công ty hiện chưa có tin tuyển dụng nào đang mở.
            </Card>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
