import type { CandidateMatchProfile } from "../../shared/ports/JobMatcher";
import type { CandidateMatchProfileLoader } from "../job-matching/candidate-match-profile.loader";
import { MATCH_SCORE_PROFILE_CACHE_MAX, MATCH_SCORE_PROFILE_LOAD_BATCH } from "./match-scores.config";

/**
 * Hồ sơ chấm của ứng viên, giữ trong bộ nhớ suốt một lượt chấm (AD-24 mục 6).
 * Không đăng ký awilix: mỗi lượt tạo một cache mới, hết lượt thì bỏ.
 *
 * Bước 0 đo được ~80% thời gian chấm một tin là nạp hồ sơ; các tin dùng chung phần lớn
 * ứng viên, nên nạp một lần cho cả lượt thì cả đêm còn ≈ 2–3 phút thay vì ≈ 24 phút.
 * Hồ sơ sửa trong lúc lượt đang chạy thì lượt sau mới vào bảng.
 */
export class CandidateProfileCache {
  private readonly profiles = new Map<string, CandidateMatchProfile>();
  private readonly loader: Pick<CandidateMatchProfileLoader, "loadMany">;
  private readonly maxSize: number;
  private readonly batchSize: number;
  private loadedCount = 0;
  private firstLoad: Date | null = null;

  constructor(
    loader: Pick<CandidateMatchProfileLoader, "loadMany">,
    options: { maxSize?: number; batchSize?: number } = {},
  ) {
    this.loader = loader;
    this.maxSize = options.maxSize ?? MATCH_SCORE_PROFILE_CACHE_MAX;
    this.batchSize = options.batchSize ?? MATCH_SCORE_PROFILE_LOAD_BATCH;
  }

  /** Tổng số hồ sơ đã nạp từ DB từ lúc tạo cache (kể cả lần nạp lại sau khi xoá). */
  get loaded(): number {
    return this.loadedCount;
  }

  /**
   * Giờ (đồng hồ server) ngay trước lần nạp đầu tiên; null nếu chưa nạp gì. Mọi hồ sơ trong
   * cache được đọc sau mốc này — Q2 (AD-27) dùng để tìm người sửa hồ sơ sau khi đã nạp.
   */
  get firstLoadAt(): Date | null {
    return this.firstLoad;
  }

  get size(): number {
    return this.profiles.size;
  }

  /**
   * Hồ sơ theo đúng thứ tự `ids` (bỏ trùng). Chỉ nạp id chưa có, theo lô. Id không còn
   * hồ sơ (ứng viên đã bị xoá) thì bỏ qua.
   */
  async getMany(ids: string[]): Promise<CandidateMatchProfile[]> {
    const unique = [...new Set(ids)];
    let missing = unique.filter((id) => !this.profiles.has(id));

    if (this.profiles.size + missing.length > this.maxSize) {
      this.profiles.clear();
      missing = unique;
    }

    if (missing.length > 0) this.firstLoad ??= new Date();
    for (let i = 0; i < missing.length; i += this.batchSize) {
      const batch = await this.loader.loadMany(missing.slice(i, i + this.batchSize));
      for (const [id, profile] of batch) this.profiles.set(id, profile);
      this.loadedCount += batch.size;
    }

    const result: CandidateMatchProfile[] = [];
    for (const id of unique) {
      const profile = this.profiles.get(id);
      if (profile) result.push(profile);
    }
    return result;
  }
}
