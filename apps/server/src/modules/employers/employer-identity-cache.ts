import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { EmployerRepository } from "./employer.repository";

// AD-19: cache userId → {employerId, companyId} trong bộ nhớ process. Chỉ cache
// danh tính vì hai giá trị này không đổi sau khi Employer được tạo (AD-5).
// Không cache company (isVerified, gói...) — nơi cần thì đọc theo companyId.
export interface EmployerIdentity {
  userId: string;
  employerId: string;
  companyId: string;
}

interface Entry {
  identity: EmployerIdentity;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 10 * 60_000;
const DEFAULT_MAX_ENTRIES = 10_000;
const EVICTION_WARN_INTERVAL_MS = 60_000;

export class EmployerIdentityCache {
  private readonly employerRepository: EmployerRepository;
  private readonly logger: Logger;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  // TTL cố định và mỗi lần lưu đều delete rồi set ⇒ thứ tự trong Map cũng là
  // thứ tự hết hạn (mục đầu Map hết hạn sớm nhất). Trúng cache không đổi thứ tự.
  private readonly entries = new Map<string, Entry>();
  // Gộp các request cùng thiếu cache của một userId. Promise trong Map còn đóng
  // vai "thế hệ": invalidate xoá nó, nên lần tra đang chạy biết mình đã cũ và
  // không lưu kết quả.
  private readonly inflight = new Map<string, Promise<EmployerIdentity | null>>();
  private evictedSinceWarn = 0;
  private lastWarnAt = Number.NEGATIVE_INFINITY;

  // Awilix chỉ truyền cradle ⇒ thông số nằm ở tham số thứ hai (test truyền vào).
  constructor(
    { employerRepository, logger }: { employerRepository: EmployerRepository; logger: Logger },
    options: { ttlMs?: number; maxEntries?: number; now?: () => number } = {},
  ) {
    this.employerRepository = employerRepository;
    this.logger = logger;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.now = options.now ?? Date.now;
  }

  get(userId: string): Promise<EmployerIdentity | null> {
    const hit = this.entries.get(userId);
    if (hit) {
      if (hit.expiresAt > this.now()) return Promise.resolve(hit.identity);
      this.entries.delete(userId);
    }

    const pending = this.inflight.get(userId);
    if (pending) return pending;

    // null (chưa làm thủ tục Employer) và lỗi DB đều không lưu.
    const lookup: Promise<EmployerIdentity | null> = this.employerRepository
      .findIdentityByUserId(userId)
      .then((row) => {
        if (!row) return null;
        const identity = { userId, employerId: row.id, companyId: row.companyId };
        if (this.inflight.get(userId) === lookup) this.store(identity);
        return identity;
      })
      .finally(() => {
        if (this.inflight.get(userId) === lookup) this.inflight.delete(userId);
      });
    this.inflight.set(userId, lookup);
    return lookup;
  }

  async require(userId: string): Promise<EmployerIdentity> {
    const identity = await this.get(userId);
    if (!identity) throw new AppError(404, "Employer profile not found");
    return identity;
  }

  /** Gọi SAU khi transaction commit, khi companyId đổi hoặc Employer/User bị xoá (AD-19 mục 4). */
  invalidate(userId: string): void {
    this.entries.delete(userId);
    this.inflight.delete(userId);
  }

  private store(identity: EmployerIdentity): void {
    const now = this.now();
    this.entries.delete(identity.userId);
    this.entries.set(identity.userId, { identity, expiresAt: now + this.ttlMs });
    if (this.entries.size > this.maxEntries) this.evict(now);
  }

  // Dọn mục đã hết hạn ở đầu Map trước; vẫn vượt trần thì bỏ mục cũ nhất còn
  // hạn. Mục vừa lưu nằm cuối Map nên không bao giờ bị bỏ.
  private evict(now: number): void {
    let dropped = 0;
    for (const [userId, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(userId);
        continue;
      }
      if (this.entries.size <= this.maxEntries) break;
      this.entries.delete(userId);
      dropped++;
    }
    if (dropped === 0) return;

    this.evictedSinceWarn += dropped;
    if (now - this.lastWarnAt < EVICTION_WARN_INTERVAL_MS) return;
    this.logger.warn("Employer identity cache is full — evicted live entries, consider raising maxEntries", {
      evicted: this.evictedSinceWarn,
      maxEntries: this.maxEntries,
    });
    this.evictedSinceWarn = 0;
    this.lastWarnAt = now;
  }
}
