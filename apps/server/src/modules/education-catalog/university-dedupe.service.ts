import type { SuggestCatalogEntryResponse } from "@sip/shared-types";
import type { CatalogRateLimitService } from "../shared/catalog-rate-limit.service";
import type { CatalogSuggestionNotifier } from "../shared/catalog-suggestion-notifier.service";
import { suggestCatalogEntry } from "./education-catalog-dedupe";
import { normalizeUniversityName } from "./education-catalog-normalize.util";
import type { UniversityRepository } from "./university.repository";

export class UniversityDedupeService {
  private readonly universityRepository: UniversityRepository;
  private readonly catalogRateLimitService: CatalogRateLimitService;
  private readonly catalogSuggestionNotifier: CatalogSuggestionNotifier;

  constructor({
    universityRepository,
    catalogRateLimitService,
    catalogSuggestionNotifier,
  }: {
    universityRepository: UniversityRepository;
    catalogRateLimitService: CatalogRateLimitService;
    catalogSuggestionNotifier: CatalogSuggestionNotifier;
  }) {
    this.universityRepository = universityRepository;
    this.catalogRateLimitService = catalogRateLimitService;
    this.catalogSuggestionNotifier = catalogSuggestionNotifier;
  }

  suggest(userId: string, name: string): Promise<SuggestCatalogEntryResponse> {
    return suggestCatalogEntry(
      {
        domain: "university",
        repository: this.universityRepository,
        catalogRateLimitService: this.catalogRateLimitService,
        catalogSuggestionNotifier: this.catalogSuggestionNotifier,
        normalize: normalizeUniversityName,
      },
      userId,
      name,
    );
  }
}
