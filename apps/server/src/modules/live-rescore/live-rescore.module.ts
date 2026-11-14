import { asClass, asFunction, asValue, type AwilixContainer } from "awilix";
import type { Logger } from "../../shared/logger";
import { CandidateRescoreMarker } from "./candidate-rescore-marker";
import { LiveRescoreRepository } from "./live-rescore.repository";
import { LiveRescoreScheduler, type LiveRescoreDrainRequester } from "./live-rescore.scheduler";

/**
 * Chấm lại theo ứng viên gần thời gian thực (0.6, AD-27). Gọi trong main.ts **trước** các
 * router: `candidateService`, `candidateCvImportService`, `skillsService`,
 * `educationCatalogService` và cron gộp danh mục nhận `candidateRescoreMarker`.
 *
 * Module chỉ phụ thuộc prisma và logger, nên các module kia nhận marker trực tiếp mà không
 * tạo vòng phụ thuộc. Chiều ngược lại (marker → lượt chấm) đi qua
 * `liveRescoreDrainRequester`, resolve lúc gọi.
 */
export function registerLiveRescore(container: AwilixContainer): void {
  container.register({
    liveRescoreRepository: asClass(LiveRescoreRepository).singleton(),
    // Bước 2: lượt chấm (LiveRescoreService.drain) chưa có, làm ở bước 3. Tới lúc đó dấu
    // nằm chờ trong DB; hẹn giờ vẫn chạy để kiểm được phần chờ ngừng sửa.
    liveRescoreDrainRequester: asValue<LiveRescoreDrainRequester>(() => {
      container.resolve<Logger>("logger").info("Live rescore: hết khoảng chờ, lượt chấm chưa có (bước 3)");
    }),
    // Singleton bắt buộc: Map hẹn giờ phải dùng chung cho mọi request.
    liveRescoreScheduler: asFunction(
      ({ liveRescoreDrainRequester, logger }: { liveRescoreDrainRequester: LiveRescoreDrainRequester; logger: Logger }) =>
        new LiveRescoreScheduler({ liveRescoreDrainRequester, logger }),
    ).singleton(),
    candidateRescoreMarker: asClass(CandidateRescoreMarker).singleton(),
  });
}
