"use client";

import Link from "next/link";
import { useCurrentUser } from "@/stores/auth-store";
import { useCandidateFullProfile, useCvList } from "@/hooks/useCvs";
import { useCandidateApplications } from "@/hooks/useApplications";
import { useCandidateInterviews } from "@/hooks/useInterviews";
import { useSavedJobs } from "@/hooks/useSavedJobs";
import { useOutreachInvitations } from "@/hooks/useCandidateOutreach";
import { useJobRecommendations } from "@/hooks/useJobRecommendations";
import { ProfileCompletenessCard } from "@/components/candidate/ProfileCompletenessCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { MatchScoreBadge } from "@/components/jobs/MatchScoreBadge";
import { APPLICATION_STATUS_LABEL } from "@/lib/application-status";
import { formatSalary } from "@/lib/job-post-display";

function formatVnDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

export function CandidateDashboardClient() {
  const user = useCurrentUser("candidate");
  const { data: profile } = useCandidateFullProfile();
  const { data: applications, isLoading: isLoadingApps } = useCandidateApplications();
  const { data: cvs, isLoading: isLoadingCvs } = useCvList();
  const { data: savedJobs } = useSavedJobs();
  const { data: invitations } = useOutreachInvitations(true);
  const { data: interviews } = useCandidateInterviews();
  const { data: recommendationsData } = useJobRecommendations(true);

  // User display name
  const displayName = profile?.fullName || user?.email?.split("@")[0] || "Ứng viên";

  // Upcoming interviews filter
  const now = Date.now();
  const upcomingInterviews = (interviews || []).filter(
    (inv) => inv.status !== "CANCELLED" && new Date(inv.scheduledAt).getTime() >= now
  );
  const nextInterview = upcomingInterviews.sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  )[0];

  const isMeetingLink = Boolean(
    nextInterview?.location && /^https?:\/\//i.test(nextInterview.location)
  );

  // Default CV
  const defaultCv = (cvs || []).find((c) => c.isDefault) || (cvs && cvs[0]);

  // Recommended jobs (top 3)
  const topRecommendations = recommendationsData?.pages?.[0]?.items?.slice(0, 3) || [];

  // Recent applications (top 4)
  const recentApplications = (applications || []).slice(0, 4);

  return (
    <div className="mx-auto max-w-[1200px] space-y-7 px-5 py-8 sm:px-7">
      {/* ─── 1. Editorial Greeting ──────────────────────────────────── */}
      <div className="animate-fade-up flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-xs font-bold tracking-wider text-brand-600 uppercase">Không gian ứng viên</span>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-text-strong sm:text-4xl">
            Xin chào, {displayName}
          </h1>
          <p className="mt-1.5 max-w-xl text-base text-text-muted">
            Theo dõi tiến độ hồ sơ, lịch phỏng vấn và các cơ hội thực tập phù hợp với bạn.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <Button as="a" href="/cv/templates" variant="secondary" icon="wand-2">
            Tạo CV mới
          </Button>
          <Button as="a" href="/jobs" variant="primary" icon="search">
            Khám phá việc làm
          </Button>
        </div>
      </div>

      {/* ─── 2. Large Editorial KPI Cards ───────────────────────────── */}
      <div className="animate-fade-up grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link href="/applications" className="group">
          <Card padding="md" interactive className="h-full">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-text-muted">Đã ứng tuyển</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-transform group-hover:scale-105">
                <Icon name="briefcase-business" size={17} />
              </span>
            </div>
            <div className="mt-3 font-mono text-4xl font-extrabold tabular-nums text-text-strong">
              {isLoadingApps ? "—" : applications?.length || 0}
            </div>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
              Xem lịch sử <Icon name="arrow-right" size={12} />
            </span>
          </Card>
        </Link>

        <Link href="/job-invitations" className="group">
          <Card padding="md" interactive className="h-full">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-text-muted">Lời mời nhận việc</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-transform group-hover:scale-105">
                <Icon name="mail" size={17} />
              </span>
            </div>
            <div className="mt-3 font-mono text-4xl font-extrabold tabular-nums text-text-strong">
              {invitations?.length || 0}
            </div>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
              Xem hộp thư <Icon name="arrow-right" size={12} />
            </span>
          </Card>
        </Link>

        <Link href="/saved-jobs" className="group">
          <Card padding="md" interactive className="h-full">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-text-muted">Việc làm đã lưu</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600 transition-transform group-hover:scale-105">
                <Icon name="bookmark" size={17} />
              </span>
            </div>
            <div className="mt-3 font-mono text-4xl font-extrabold tabular-nums text-text-strong">
              {savedJobs?.length || 0}
            </div>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-violet-700">
              Xem danh sách lưu <Icon name="arrow-right" size={12} />
            </span>
          </Card>
        </Link>

        <Link href="/cv" className="group">
          <Card padding="md" interactive className="h-full">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-text-muted">CV hiện có</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 transition-transform group-hover:scale-105">
                <Icon name="file-text" size={17} />
              </span>
            </div>
            <div className="mt-3 font-mono text-4xl font-extrabold tabular-nums text-text-strong">
              {isLoadingCvs ? "—" : cvs?.length || 0}
            </div>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
              Quản lý CV <Icon name="arrow-right" size={12} />
            </span>
          </Card>
        </Link>
      </div>

      {/* ─── 3. Main Bento Grid (Left Main + Right 360px) ───────────── */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left Column: Recent Applications & Top Recommended Jobs */}
        <div className="flex flex-col gap-6">
          {/* Recent Applications Card */}
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-text-strong">Đơn ứng tuyển gần đây</h2>
                <p className="text-xs text-text-muted">Trạng thái cập nhật trực tiếp khi nhà tuyển dụng xử lý hồ sơ.</p>
              </div>
              <Button as="a" href="/applications" variant="ghost" size="sm" iconAfter="chevron-right">
                Xem tất cả
              </Button>
            </div>

            {isLoadingApps ? (
              <div className="flex items-center justify-center gap-2 py-10 text-text-muted">
                <Icon name="loader-circle" size={18} className="animate-spin" />
                <span className="text-sm">Đang tải đơn ứng tuyển...</span>
              </div>
            ) : recentApplications.length === 0 ? (
              <div className="m-6 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-default bg-surface-page/60 py-10 text-center">
                <Icon name="briefcase" size={32} className="text-text-subtle" />
                <p className="text-[15px] font-semibold text-text-strong">Bạn chưa nộp đơn ứng tuyển nào</p>
                <p className="text-sm text-text-muted">Hãy khám phá các cơ hội thực tập hấp dẫn và nộp hồ sơ ngay.</p>
                <Button as="a" href="/jobs" variant="secondary" size="sm" icon="search" className="mt-2">
                  Khám phá việc làm
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {recentApplications.map((app) => {
                  const statusMeta = APPLICATION_STATUS_LABEL[app.status] || { label: app.status, tone: "neutral" };
                  const job = app.jobPost;
                  const companyName = job.company?.name || "Doanh nghiệp";
                  return (
                    <div key={app.id} className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-surface-hover/60">
                      <div className="flex min-w-0 items-center gap-3.5">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-sm font-extrabold text-brand-700">
                          {companyName.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <Link href={`/jobs/${job.id}`} className="block truncate text-[15px] font-bold text-text-strong hover:text-brand-600">
                            {job.title}
                          </Link>
                          <div className="mt-0.5 flex items-center gap-2 text-sm text-text-muted">
                            <span className="truncate">{companyName}</span>
                            <span>·</span>
                            <span className="font-mono text-xs">{formatVnDate(app.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Top Recommended Jobs Card */}
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-text-strong">Việc làm phù hợp với bạn</h2>
                <p className="text-xs text-text-muted">Gợi ý dựa trên kỹ năng và chuyên ngành trong hồ sơ.</p>
              </div>
              <Button as="a" href="/recommended-jobs" variant="ghost" size="sm" iconAfter="chevron-right">
                Xem tất cả
              </Button>
            </div>

            {topRecommendations.length === 0 ? (
              <div className="m-6 rounded-xl border border-dashed border-border-default bg-surface-page/60 py-8 text-center">
                <p className="text-[15px] font-semibold text-text-strong">Chưa có gợi ý việc làm</p>
                <p className="mt-1 text-sm text-text-muted">Cập nhật kỹ năng trong hồ sơ để nhận gợi ý việc làm chính xác hơn.</p>
                <Button as="a" href="/profile" variant="secondary" size="sm" icon="edit" className="mt-3">
                  Cập nhật kỹ năng
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {topRecommendations.map((rec) => {
                  const job = rec.jobPost;
                  return (
                    <div key={job.id} className="flex flex-col gap-3 px-6 py-4 transition-colors hover:bg-surface-hover/60">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/jobs/${job.id}`} className="block truncate text-[15px] font-bold text-text-strong hover:text-brand-600">
                            {job.title}
                          </Link>
                          <span className="mt-0.5 block text-sm text-text-muted">{job.company?.name || "Doanh nghiệp"}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <MatchScoreBadge score={rec.match.score} status={rec.match.status} />
                          <span className="font-mono text-xs font-bold text-brand-700">{rec.match.score}%</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-muted">
                        <div className="flex items-center gap-4">
                          <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-text-strong">
                            <Icon name="banknote" size={14} className="text-brand-500" />
                            {formatSalary(job)}
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <Icon name="map-pin" size={14} />
                            {job.cityName || "Toàn quốc"}
                          </span>
                        </div>
                        <Button as="a" href={`/jobs/${job.id}`} variant="secondary" size="sm">
                          Xem tin
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Upcoming Interview Dark Card + Profile Completeness + Default CV */}
        <div className="flex flex-col gap-5">
          {nextInterview && (
            <div className="grid gap-4 rounded-2xl bg-[#0d1117] p-6 text-white shadow-[0_12px_32px_-6px_rgba(13,17,23,0.2)]">
              <div className="flex items-center justify-between">
                <Badge tone="warning">Phỏng vấn sắp tới</Badge>
                <span className="font-mono text-xs text-slate-400">
                  {new Date(nextInterview.scheduledAt).toLocaleDateString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{nextInterview.jobPostTitle}</h3>
                <p className="mt-0.5 text-sm text-slate-400">{nextInterview.companyName}</p>
              </div>
              <div className="grid gap-2 rounded-xl bg-white/8 p-3.5 text-sm text-slate-200">
                <div className="flex items-center gap-2">
                  <Icon name={nextInterview.mode === "ONLINE" ? "video" : "map-pin"} size={15} className="shrink-0 text-brand-400" />
                  <span>{nextInterview.mode === "ONLINE" ? "Trực tuyến" : "Trực tiếp tại văn phòng"}</span>
                </div>
                {nextInterview.location && !isMeetingLink && (
                  <p className="text-xs text-slate-300">Địa điểm: {nextInterview.location}</p>
                )}
              </div>
              {isMeetingLink ? (
                <Button as="a" href={nextInterview.location!} target="_blank" rel="noreferrer" variant="primary" fullWidth icon="video">
                  Vào phòng họp
                </Button>
              ) : (
                <Button as="a" href="/applications" variant="secondary" fullWidth icon="eye">
                  Xem chi tiết
                </Button>
              )}
            </div>
          )}

          <ProfileCompletenessCard variant="compact" />

          {/* Active Default CV Widget */}
          <Card padding="md" className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <span className="flex items-center gap-2 text-base font-bold text-text-strong">
                <Icon name="file-text" size={17} className="text-brand-500" />
                CV mặc định
              </span>
              <Button as="a" href="/cv" variant="ghost" size="sm">
                Quản lý
              </Button>
            </div>

            {defaultCv ? (
              <div className="rounded-xl border border-border-subtle bg-surface-page p-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-white text-brand-600">
                    <Icon name="file-text" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-text-strong">{defaultCv.fileName}</p>
                    <p className="mt-0.5 font-mono text-xs text-text-muted">Cập nhật: {formatVnDate(defaultCv.uploadedAt)}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button as="a" href={defaultCv.fileUrl} target="_blank" rel="noreferrer" variant="secondary" size="sm" icon="external-link" className="flex-1">
                    Xem file
                  </Button>
                  {defaultCv.isBuilder && (
                    <Button as="a" href={`/cv/editor?cvId=${defaultCv.id}`} variant="primary" size="sm" icon="edit-3" className="flex-1">
                      Sửa
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="text-sm text-text-muted">Bạn chưa có CV mặc định để ứng tuyển nhanh.</p>
                <Button as="a" href="/cv/templates" variant="primary" size="sm" icon="plus" className="mt-3 w-full">
                  Tạo CV ngay
                </Button>
              </div>
            )}
          </Card>

          {/* Internship Tips Card */}
          <Card padding="md" tone="brand">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-brand-700">
              <Icon name="lightbulb" size={17} className="text-brand-600" />
              <span>Mẹo tìm việc thực tập hiệu quả</span>
            </div>
            <ul className="space-y-2.5 text-sm leading-relaxed text-text-body">
              <li className="flex items-start gap-2">
                <Icon name="check-circle" size={15} className="mt-1 shrink-0 text-brand-600" />
                <span>Hoàn thiện hồ sơ trên 80% để tăng 2x cơ hội được Nhà tuyển dụng chủ động gửi lời mời.</span>
              </li>
              <li className="flex items-start gap-2">
                <Icon name="check-circle" size={15} className="mt-1 shrink-0 text-brand-600" />
                <span>Nộp đơn sớm vào đầu tuần giúp CV của bạn được HR duyệt đầu tiên.</span>
              </li>
              <li className="flex items-start gap-2">
                <Icon name="check-circle" size={15} className="mt-1 shrink-0 text-brand-600" />
                <span>Đính kèm lời giới thiệu ngắn gọn giải thích lý do bạn phù hợp với vị trí.</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
