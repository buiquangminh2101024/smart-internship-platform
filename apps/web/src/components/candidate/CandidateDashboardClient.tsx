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
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* ─── 1. Welcome & Greeting Banner ─────────────────────────── */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border-default pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-text-strong">
              Xin chào, {displayName}! 👋
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-pine-50 text-pine-700 border border-pine-200">
              Sinh viên thực tập
            </span>
          </div>
          <p className="text-sm text-text-muted">
            Chào mừng bạn trở lại. Cùng theo dõi tiến độ tìm kiếm cơ hội thực tập hôm nay.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button as="a" href="/cv/templates" variant="secondary" size="sm" icon="wand-2">
            Tạo CV mới
          </Button>
          <Button as="a" href="/jobs" variant="primary" size="sm" icon="search">
            Tìm việc thực tập
          </Button>
        </div>
      </div>

      {/* ─── 2. Profile Completeness Widget ────────────────────────── */}
      <div className="mb-6">
        <ProfileCompletenessCard variant="compact" />
      </div>

      {/* ─── 3. Upcoming Interview Alert (if any) ────────────────────── */}
      {nextInterview && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50/80 p-4 shadow-xs">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                <Icon name="calendar-clock" size={22} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-amber-950 text-sm">Lịch phỏng vấn sắp tới!</span>
                  <Badge tone="warning">
                    {new Date(nextInterview.scheduledAt).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-amber-900">
                  Bạn có buổi phỏng vấn vị trí{" "}
                  <span className="font-semibold">{nextInterview.jobPostTitle}</span> ({nextInterview.companyName}).
                  Hình thức: {nextInterview.mode === "ONLINE" ? "Trực tuyến" : "Trực tiếp tại văn phòng"}.
                  {nextInterview.location && !isMeetingLink && (
                    <span className="block mt-0.5 font-medium">Địa điểm: {nextInterview.location}</span>
                  )}
                </p>
              </div>
            </div>
            {isMeetingLink ? (
              <Button as="a" href={nextInterview.location!} target="_blank" rel="noreferrer" variant="primary" size="sm" icon="video">
                Vào phòng họp
              </Button>
            ) : (
              <Button as="a" href="/applications" variant="secondary" size="sm" icon="eye">
                Xem chi tiết
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ─── 4. Quick Metrics Stats Cards ──────────────────────────── */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link href="/applications" className="group">
          <Card padding="md" className="transition-all hover:border-pine-400 hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-muted">Đã ứng tuyển</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pine-50 text-pine-700 group-hover:scale-110 transition-transform">
                <Icon name="briefcase-business" size={16} />
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-text-strong">
              {isLoadingApps ? "—" : applications?.length || 0}
            </div>
            <span className="mt-1 text-[11px] text-pine-700 flex items-center gap-1 font-medium">
              Xem lịch sử <Icon name="arrow-right" size={11} />
            </span>
          </Card>
        </Link>

        <Link href="/job-invitations" className="group">
          <Card padding="md" className="transition-all hover:border-pine-400 hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-muted">Lời mời nhận việc</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700 group-hover:scale-110 transition-transform">
                <Icon name="mail" size={16} />
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-text-strong">
              {invitations?.length || 0}
            </div>
            <span className="mt-1 text-[11px] text-blue-700 flex items-center gap-1 font-medium">
              Xem hộp thư <Icon name="arrow-right" size={11} />
            </span>
          </Card>
        </Link>

        <Link href="/saved-jobs" className="group">
          <Card padding="md" className="transition-all hover:border-pine-400 hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-muted">Việc làm đã lưu</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-700 group-hover:scale-110 transition-transform">
                <Icon name="bookmark" size={16} />
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-text-strong">
              {savedJobs?.length || 0}
            </div>
            <span className="mt-1 text-[11px] text-purple-700 flex items-center gap-1 font-medium">
              Xem danh sách lưu <Icon name="arrow-right" size={11} />
            </span>
          </Card>
        </Link>

        <Link href="/cv" className="group">
          <Card padding="md" className="transition-all hover:border-pine-400 hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-muted">CV hiện có</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700 group-hover:scale-110 transition-transform">
                <Icon name="file-text" size={16} />
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-text-strong">
              {isLoadingCvs ? "—" : cvs?.length || 0}
            </div>
            <span className="mt-1 text-[11px] text-amber-700 flex items-center gap-1 font-medium">
              Quản lý CV <Icon name="arrow-right" size={11} />
            </span>
          </Card>
        </Link>
      </div>

      {/* ─── 5. Main Content: 2 Columns Split ──────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column (2/3): Recent Applications & Top Recommended Jobs */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Recent Applications Card */}
          <Card padding="md" className="flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-border-default mb-4">
              <div className="flex items-center gap-2">
                <Icon name="briefcase-business" size={18} className="text-pine-600" />
                <h2 className="font-semibold text-text-strong text-base">Đơn ứng tuyển gần đây</h2>
              </div>
              <Button as="a" href="/applications" variant="ghost" size="sm" iconAfter="chevron-right">
                Xem tất cả
              </Button>
            </div>

            {isLoadingApps ? (
              <div className="py-8 flex items-center justify-center text-text-muted gap-2">
                <Icon name="loader-circle" size={18} className="animate-spin" />
                <span className="text-sm">Đang tải đơn ứng tuyển...</span>
              </div>
            ) : recentApplications.length === 0 ? (
              <div className="py-8 text-center flex flex-col items-center justify-center gap-2 bg-neutral-50/50 rounded-lg border border-dashed border-border-default">
                <Icon name="briefcase" size={32} className="text-text-muted opacity-40" />
                <p className="text-sm text-text-body font-medium">Bạn chưa nộp đơn ứng tuyển nào</p>
                <p className="text-xs text-text-muted">Hãy khám phá các cơ hội thực tập hấp dẫn và nộp hồ sơ ngay.</p>
                <Button as="a" href="/jobs" variant="secondary" size="sm" icon="search" className="mt-2">
                  Khám phá việc làm
                </Button>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border-subtle">
                {recentApplications.map((app) => {
                  const statusMeta = APPLICATION_STATUS_LABEL[app.status] || { label: app.status, tone: "neutral" };
                  const job = app.jobPost;
                  return (
                    <div key={app.id} className="py-3 flex items-center justify-between gap-4 hover:bg-neutral-50/50 rounded-lg px-2 transition-colors">
                      <div className="min-w-0">
                        <Link href={`/jobs/${job.id}`} className="font-medium text-sm text-text-strong hover:text-pine-700 truncate block">
                          {job.title}
                        </Link>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-text-muted">
                          <span>{job.company?.name || "Doanh nghiệp"}</span>
                          <span>•</span>
                          <span>{formatVnDate(app.createdAt)}</span>
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
          <Card padding="md" className="flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-border-default mb-4">
              <div className="flex items-center gap-2">
                <Icon name="sparkles" size={18} className="text-pine-600" />
                <h2 className="font-semibold text-text-strong text-base">Việc làm phù hợp với bạn</h2>
              </div>
              <Button as="a" href="/recommended-jobs" variant="ghost" size="sm" iconAfter="chevron-right">
                Xem tất cả
              </Button>
            </div>

            {topRecommendations.length === 0 ? (
              <div className="py-6 text-center text-text-muted text-sm bg-neutral-50/50 rounded-lg border border-dashed border-border-default">
                <p className="font-medium">Chưa có gợi ý việc làm</p>
                <p className="text-xs text-text-muted mt-1">Cập nhật kỹ năng trong hồ sơ để nhận gợi ý việc làm chính xác hơn.</p>
                <Button as="a" href="/profile" variant="secondary" size="sm" icon="edit" className="mt-2">
                  Cập nhật kỹ năng
                </Button>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border-subtle">
                {topRecommendations.map((rec) => {
                  const job = rec.jobPost;
                  return (
                    <div key={job.id} className="py-3.5 flex flex-col gap-2 hover:bg-neutral-50/50 rounded-lg px-2 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/jobs/${job.id}`} className="font-semibold text-sm text-text-strong hover:text-pine-700 truncate block">
                            {job.title}
                          </Link>
                          <span className="text-xs text-text-muted block mt-0.5">{job.company?.name || "Doanh nghiệp"}</span>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          <MatchScoreBadge score={rec.match.score} status={rec.match.status} />
                          <span className="text-xs font-semibold text-pine-700">{rec.match.score}%</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Icon name="banknote" size={13} />
                            {formatSalary(job)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Icon name="map-pin" size={13} />
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

        {/* Right Column (1/3): Active CV Widget & Quick Tips */}
        <div className="flex flex-col gap-6">
          {/* Active Default CV Widget */}
          <Card padding="md" className="flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-border-default mb-3">
              <span className="font-semibold text-text-strong text-sm flex items-center gap-2">
                <Icon name="file-text" size={16} className="text-pine-600" />
                CV mặc định
              </span>
              <Button as="a" href="/cv" variant="ghost" size="sm">
                Quản lý
              </Button>
            </div>

            {defaultCv ? (
              <div className="rounded-lg border border-border-subtle bg-neutral-50/60 p-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pine-100 text-pine-700">
                    <Icon name="file-text" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-strong">{defaultCv.fileName}</p>
                    <p className="text-xs text-text-muted mt-0.5">Cập nhật: {formatVnDate(defaultCv.uploadedAt)}</p>
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
                <p className="text-xs text-text-muted">Bạn chưa có CV mặc định để ứng tuyển nhanh.</p>
                <Button as="a" href="/cv/templates" variant="primary" size="sm" icon="plus" className="mt-3 w-full">
                  Tạo CV ngay
                </Button>
              </div>
            )}
          </Card>

          {/* Internship Tips Card */}
          <Card padding="md" className="bg-pine-50/40 border-pine-200">
            <div className="flex items-center gap-2 text-pine-800 font-semibold text-sm mb-3">
              <Icon name="lightbulb" size={18} className="text-pine-600" />
              <span>Mẹo tìm việc thực tập hiệu quả</span>
            </div>
            <ul className="space-y-2.5 text-xs text-pine-950 leading-relaxed">
              <li className="flex items-start gap-2">
                <Icon name="check-circle" size={14} className="text-pine-600 shrink-0 mt-0.5" />
                <span>Hoàn thiện hồ sơ trên 80% để tăng 2x cơ hội được Nhà tuyển dụng chủ động gửi lời mời.</span>
              </li>
              <li className="flex items-start gap-2">
                <Icon name="check-circle" size={14} className="text-pine-600 shrink-0 mt-0.5" />
                <span>Nộp đơn sớm vào đầu tuần (Thứ Hai, Thứ Ba) giúp CV của bạn được HR duyệt đầu tiên.</span>
              </li>
              <li className="flex items-start gap-2">
                <Icon name="check-circle" size={14} className="text-pine-600 shrink-0 mt-0.5" />
                <span>Đính kèm lời giới thiệu (Cover letter) ngắn gọn giải thích lý do bạn phù hợp với vị trí.</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
