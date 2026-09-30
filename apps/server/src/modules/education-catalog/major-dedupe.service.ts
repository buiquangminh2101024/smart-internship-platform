import type { SuggestCatalogEntryResponse } from "@sip/shared-types";
import type { CatalogRateLimitService } from "../shared/catalog-rate-limit.service";
import type { CatalogSuggestionNotifier } from "../shared/catalog-suggestion-notifier.service";
import type { ApprovedCatalogMatch } from "../skills/skill-dedupe.service";
import { findApprovedCatalogEntry, suggestCatalogEntry } from "./education-catalog-dedupe";
import { normalizeMajorName } from "./education-catalog-normalize.util";
import type { MajorRepository } from "./major.repository";

export class MajorDedupeService {
  private readonly majorRepository: MajorRepository;
  private readonly catalogRateLimitService: CatalogRateLimitService;
  private readonly catalogSuggestionNotifier: CatalogSuggestionNotifier;

  constructor({
    majorRepository,
    catalogRateLimitService,
    catalogSuggestionNotifier,
  }: {
    majorRepository: MajorRepository;
    catalogRateLimitService: CatalogRateLimitService;
    catalogSuggestionNotifier: CatalogSuggestionNotifier;
  }) {
    this.majorRepository = majorRepository;
    this.catalogRateLimitService = catalogRateLimitService;
    this.catalogSuggestionNotifier = catalogSuggestionNotifier;
  }

  suggest(userId: string, name: string): Promise<SuggestCatalogEntryResponse> {
    return suggestCatalogEntry(
      {
        domain: "major",
        repository: this.majorRepository,
        catalogRateLimitService: this.catalogRateLimitService,
        catalogSuggestionNotifier: this.catalogSuggestionNotifier,
        normalize: normalizeMajorName,
      },
      userId,
      name,
    );
  }

  /** Chỉ tra cứu ngành APPROVED, không tạo mới (Job Matcher GĐ3). */
  findBestApproved(name: string): Promise<ApprovedCatalogMatch | null> {
    return findApprovedCatalogEntry({ repository: this.majorRepository, normalize: normalizeMajorName }, name);
  }
}
