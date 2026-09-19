import type { SuggestCatalogEntryResponse } from "@sip/shared-types";
import type { CatalogRateLimitService } from "../shared/catalog-rate-limit.service";
import { suggestCatalogEntry } from "./education-catalog-dedupe";
import { normalizeUniversityName } from "./education-catalog-normalize.util";
import type { UniversityRepository } from "./university.repository";

export class UniversityDedupeService {
  private readonly universityRepository: UniversityRepository;
  private readonly catalogRateLimitService: CatalogRateLimitService;

  constructor({
    universityRepository,
    catalogRateLimitService,
  }: {
    universityRepository: UniversityRepository;
    catalogRateLimitService: CatalogRateLimitService;
  }) {
    this.universityRepository = universityRepository;
    this.catalogRateLimitService = catalogRateLimitService;
  }

  suggest(userId: string, name: string): Promise<SuggestCatalogEntryResponse> {
    return suggestCatalogEntry(
      {
        domain: "university",
        repository: this.universityRepository,
        catalogRateLimitService: this.catalogRateLimitService,
        normalize: normalizeUniversityName,
      },
      userId,
      name,
    );
  }
}
