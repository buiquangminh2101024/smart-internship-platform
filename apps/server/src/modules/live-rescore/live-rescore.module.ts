import { asClass, asFunction, asValue, type AwilixContainer } from "awilix";
import type { Logger } from "../../shared/logger";
import { CandidateRescoreMarker } from "./candidate-rescore-marker";
import type { JobMatchProfileLoader } from "../job-matching/job-match-profile.loader";
import { InMemoryJobProfileCache } from "./job-profile-cache";
import { LiveRescoreFollowUps } from "./live-rescore-follow-ups";
import { MatchUpdatePublisher } from "./match-update-publisher";
import type { RealtimeNotifier } from "../../shared/ports/RealtimeNotifier";
import type { EmployerRepository } from "../employers/employer.repository";
import { LiveRescoreRepository } from "./live-rescore.repository";
import { LiveRescoreRunStore } from "./live-rescore-run-store";
import { LiveRescoreScheduler, type LiveRescoreDrainRequester } from "./live-rescore.scheduler";
import { LiveRescoreService } from "./live-rescore.service";

/**
 * Chấm lại theo ứng viên gần thời gian thực (0.6, AD-27). Gọi trong main.ts **trước** các
 * router: `candidateService`, `candidateCvImportService`, `skillsService`,
 * `educationCatalogService` và cron gộp danh mục nhận `candidateRescoreMarker`.
 *
 * Marker chỉ phụ thuộc prisma, logger và cache hồ sơ tin, nên các module kia nhận marker
 * trực tiếp mà không tạo vòng phụ thuộc. Chiều ngược lại (marker → lượt chấm) đi qua
 * `liveRescoreDrainRequester`, resolve `liveRescoreService` lúc gọi. Service cần
 * `matchScoreRepository`, `candidateOutreachService`, `candidateMatchProfileLoader`,
 * `jobMatchProfileLoader` và `redis` — đăng ký ở module khác, chỉ resolve khi dùng.
 *
 * Việc kéo theo (bước 4) cần `autoOutreachRepository`, `autoOutreachTrigger` (candidate-outreach),
 * `autoReviewTrigger` (application-automation), `candidateFirstScoredListener` (job-alerts),
 * `realtimeNotifier` và `employerRepository`; các trigger tự resolve service lúc gọi.
 */
export function registerLiveRescore(container: AwilixContainer): void {
  container.register({
    liveRescoreRepository: asClass(LiveRescoreRepository).singleton(),
    liveRescoreRunStore: asClass(LiveRescoreRunStore).singleton(),
    // asFunction (không asClass) ở cache, service và hẹn giờ: constructor có tham số tuỳ chọn
    // cho test, mà awilix báo lỗi khi đọc một tên chưa đăng ký.
    // Singleton bắt buộc: cache dùng chung giữa các lượt, và marker xoá đúng cache này.
    jobProfileCache: asFunction(
      ({ jobMatchProfileLoader }: { jobMatchProfileLoader: JobMatchProfileLoader }) =>
        new InMemoryJobProfileCache({ jobMatchProfileLoader }),
    ).singleton(),
    // Singleton bắt buộc: cờ "đang có lượt" phải dùng chung cho hẹn giờ, danh mục và cron.
    liveRescoreService: asFunction(
      (deps: Omit<ConstructorParameters<typeof LiveRescoreService>[0], "liveRescoreServiceOptions">) =>
        new LiveRescoreService({
          liveRescoreRepository: deps.liveRescoreRepository,
          matchScoreRepository: deps.matchScoreRepository,
          candidateOutreachService: deps.candidateOutreachService,
          candidateMatchProfileLoader: deps.candidateMatchProfileLoader,
          jobProfileCache: deps.jobProfileCache,
          liveRescoreRunStore: deps.liveRescoreRunStore,
          liveRescoreFollowUps: deps.liveRescoreFollowUps,
          logger: deps.logger,
        }),
    ).singleton(),
    liveRescoreFollowUps: asClass(LiveRescoreFollowUps).singleton(),
    // Singleton bắt buộc: mốc "lần gửi gần nhất" theo công ty phải dùng chung cho mọi lượt.
    matchUpdatePublisher: asFunction(
      ({
        realtimeNotifier,
        employerRepository,
        logger,
      }: {
        realtimeNotifier: RealtimeNotifier;
        employerRepository: EmployerRepository;
        logger: Logger;
      }) => new MatchUpdatePublisher({ realtimeNotifier, employerRepository, logger }),
    ).singleton(),
    liveRescoreDrainRequester: asValue<LiveRescoreDrainRequester>(() => {
      container.resolve<LiveRescoreService>("liveRescoreService").requestDrain();
    }),
    // Singleton bắt buộc: Map hẹn giờ phải dùng chung cho mọi request.
    liveRescoreScheduler: asFunction(
      ({ liveRescoreDrainRequester, logger }: { liveRescoreDrainRequester: LiveRescoreDrainRequester; logger: Logger }) =>
        new LiveRescoreScheduler({ liveRescoreDrainRequester, logger }),
    ).singleton(),
    candidateRescoreMarker: asClass(CandidateRescoreMarker).singleton(),
  });
}
