import type { JobMatchProfile } from "../../shared/ports/JobMatcher";
import type { JobMatchProfileLoader } from "../job-matching/job-match-profile.loader";
import { JOB_PROFILE_CACHE_MAX_ENTRIES, JOB_PROFILE_CACHE_TTL_MS } from "./live-rescore.config";

/** Hồ sơ chấm của tin dùng chung giữa các lượt chấm theo ứng viên (AD-27 mục 5, D5). */
export interface JobProfileCache {
  /** Hồ sơ còn hạn lấy từ cache, phần thiếu nạp một lần. Tin không còn thì không có trong Map. */
  getMany(jobPostIds: string[]): Promise<Map<string, JobMatchProfile>>;
  invalidate(jobPostIds: string[]): void;
  /** Danh mục kỹ năng / ngành đổi (D6): hồ sơ tin đọc tên và trạng thái kỹ năng, tên ngành. */
  clear(): void;
}

interface Entry {
  profile: JobMatchProfile;
  expiresAt: number;
}

/**
 * Bản cài trong bộ nhớ của process. Tin đã gửi duyệt / đang hiển thị không sửa được
 * (`JobPostsService.updateDraft` chỉ cho DRAFT), nên hồ sơ tin chỉ đổi khi danh mục đổi —
 * `CandidateRescoreMarker` gọi `clear()` lúc đó. TTL 1 giờ là lưới an toàn (ví dụ Admin
 * đổi tên kỹ năng). Map giữ thứ tự chèn: lấy trúng thì chèn lại, nên mục đầu là mục dùng
 * lâu nhất.
 */
export class InMemoryJobProfileCache implements JobProfileCache {
  private readonly loader: Pick<JobMatchProfileLoader, "loadMany">;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, Entry>();

  constructor({
    jobMatchProfileLoader,
    jobProfileCacheOptions,
  }: {
    jobMatchProfileLoader: Pick<JobMatchProfileLoader, "loadMany">;
    jobProfileCacheOptions?: { ttlMs?: number; maxEntries?: number; now?: () => number };
  }) {
    this.loader = jobMatchProfileLoader;
    this.ttlMs = jobProfileCacheOptions?.ttlMs ?? JOB_PROFILE_CACHE_TTL_MS;
    this.maxEntries = jobProfileCacheOptions?.maxEntries ?? JOB_PROFILE_CACHE_MAX_ENTRIES;
    this.now = jobProfileCacheOptions?.now ?? Date.now;
  }

  get size(): number {
    return this.entries.size;
  }

  async getMany(jobPostIds: string[]): Promise<Map<string, JobMatchProfile>> {
    const now = this.now();
    const result = new Map<string, JobMatchProfile>();
    const missing: string[] = [];
    for (const id of new Set(jobPostIds)) {
      const entry = this.entries.get(id);
      if (entry && entry.expiresAt > now) {
        this.entries.delete(id);
        this.entries.set(id, entry);
        result.set(id, entry.profile);
      } else {
        if (entry) this.entries.delete(id);
        missing.push(id);
      }
    }

    if (missing.length > 0) {
      const loaded = await this.loader.loadMany(missing);
      for (const [id, profile] of loaded) {
        this.entries.set(id, { profile, expiresAt: now + this.ttlMs });
        result.set(id, profile);
      }
      this.evict();
    }
    return result;
  }

  invalidate(jobPostIds: string[]): void {
    for (const id of jobPostIds) this.entries.delete(id);
  }

  clear(): void {
    this.entries.clear();
  }

  private evict(): void {
    for (const id of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) return;
      this.entries.delete(id);
    }
  }
}
