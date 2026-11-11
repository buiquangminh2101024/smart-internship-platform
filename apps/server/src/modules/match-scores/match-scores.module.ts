import { asClass, asValue, type AwilixContainer } from "awilix";
import { MatchScoreRepository } from "./match-score.repository";
import { MatchScoreService, type MatchScoreTrigger } from "./match-score.service";

/**
 * Bảng điểm lưu sẵn (0.3, AD-24). Module chưa có route riêng: API tiến độ tuyển nằm ở
 * dashboard và thẻ tự mời (plan bước 5). Gọi sau candidateOutreachRouter trong main.ts:
 * service cần candidateOutreachService và candidateMatchProfileLoader; cả hai chỉ resolve
 * lúc dùng nên thứ tự chỉ để dễ đọc.
 */
export function registerMatchScores(container: AwilixContainer): void {
  container.register({
    matchScoreRepository: asClass(MatchScoreRepository).singleton(),
    // Singleton bắt buộc: Set tin đang chấm phải dùng chung cho mọi lối gọi.
    matchScoreService: asClass(MatchScoreService).singleton(),
    // Lối kích hoạt cho JobPostsService khi tin chuyển PUBLISHED: resolve service lúc gọi
    // ⇒ không có vòng phụ thuộc khi dựng service (giống autoOutreachTrigger).
    matchScoreTrigger: asValue<MatchScoreTrigger>((jobPostId) => {
      container.resolve<MatchScoreService>("matchScoreService").trigger(jobPostId);
    }),
  });
}
