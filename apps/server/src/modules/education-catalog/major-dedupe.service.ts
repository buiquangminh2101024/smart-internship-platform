import type { SuggestCatalogEntryResponse } from "@sip/shared-types";
import type { CatalogRateLimitService } from "../shared/catalog-rate-limit.service";
import type { ApprovedCatalogMatch } from "../skills/skill-dedupe.service";
import { findApprovedCatalogEntry, suggestCatalogEntry } from "./education-catalog-dedupe";
import { normalizeMajorName } from "./education-catalog-normalize.util";
import type { MajorRepository } from "./major.repository";

export class MajorDedupeService {
  private readonly majorRepository: MajorRepository;
  private readonly catalogRateLimitService: CatalogRateLimitService;

  constructor({
    majorRepository,
    catalogRateLimitService,
  }: {
    majorRepository: MajorRepository;
    catalogRateLimitService: CatalogRateLimitService;
  }) {
    this.majorRepository = majorRepository;
    this.catalogRateLimitService = catalogRateLimitService;
  }

  suggest(userId: string, name: string): Promise<SuggestCatalogEntryResponse> {
    return suggestCatalogEntry(
      {
        domain: "major",
        repository: this.majorRepository,
        catalogRateLimitService: this.catalogRateLimitService,
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
