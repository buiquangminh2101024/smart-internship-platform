import type { CatalogItem } from "@sip/shared-types";
import type { CatalogRepository } from "./catalog.repository";

export class CatalogService {
  private readonly catalogRepository: CatalogRepository;

  constructor({ catalogRepository }: { catalogRepository: CatalogRepository }) {
    this.catalogRepository = catalogRepository;
  }

  async industries(): Promise<CatalogItem[]> {
    return this.catalogRepository.listIndustries();
  }

  async companyTypes(): Promise<CatalogItem[]> {
    return this.catalogRepository.listCompanyTypes();
  }

  async cities(): Promise<CatalogItem[]> {
    return this.catalogRepository.listCities();
  }
}
