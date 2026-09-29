import type { Logger } from "../../shared/logger";
import type { CatalogDomain } from "../../shared/ports/CatalogMatchVerifier";
import type { NotificationsService } from "../notifications/notifications.service";
import type { UserRepository } from "../users/user.repository";

const ENTRY_TYPES = { skill: "SKILL", university: "UNIVERSITY", major: "MAJOR" } as const;

/**
 * Báo Admin khi có kỹ năng/trường/ngành mới vào hàng chờ duyệt
 * (CATALOG_ENTRY_SUGGESTED, chỉ trong app — AD-16, D8). Dùng chung cho
 * skill-dedupe và education-catalog-dedupe, giống catalogRateLimitService.
 *
 * Gọi SAU khi mục PENDING đã được tạo (tạo mục không nằm trong transaction), nên
 * lỗi ở đây chỉ được log: người đề xuất đã có mục của mình, và Admin vẫn thấy
 * mục đó trong hàng chờ dù thiếu thông báo.
 */
export class CatalogSuggestionNotifier {
  private readonly userRepository: UserRepository;
  private readonly notificationsService: NotificationsService;
  private readonly logger: Logger;

  constructor({
    userRepository,
    notificationsService,
    logger,
  }: {
    userRepository: UserRepository;
    notificationsService: NotificationsService;
    logger: Logger;
  }) {
    this.userRepository = userRepository;
    this.notificationsService = notificationsService;
    this.logger = logger;
  }

  async notifyAdmins(domain: CatalogDomain, entry: { id: string; name: string }): Promise<void> {
    try {
      const adminIds = await this.userRepository.findAdminIds();
      await this.notificationsService.notifyMany("CATALOG_ENTRY_SUGGESTED", adminIds, {
        entryType: ENTRY_TYPES[domain],
        entryId: entry.id,
        entryName: entry.name,
      });
    } catch (error) {
      this.logger.error("Không gửi được thông báo đề xuất danh mục cho Admin", { error, domain, entryId: entry.id });
    }
  }
}
