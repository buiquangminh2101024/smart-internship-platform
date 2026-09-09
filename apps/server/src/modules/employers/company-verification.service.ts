import { promises as dns } from "node:dns";

export type VerificationOutcome =
  | { outcome: "AUTO_VERIFIED"; shortName: string }
  | { outcome: "NEEDS_MANUAL_REVIEW"; reason: "COMMON_EMAIL_DOMAIN" | "DOMAIN_MISMATCH"; shortName?: string }
  | {
      outcome: "BLOCKED";
      reason: "NO_MAIL_SERVER" | "TAX_CODE_INVALID" | "TAX_CODE_NOT_FOUND" | "TAX_LOOKUP_FAILED";
    };

interface VerificationConfig {
  COMMON_EMAIL_DOMAINS: string[];
  VIETQR_API_URL: string;
}

// Đuôi domain tổ chức phổ biến ở Việt Nam — bóc tách để lấy các nhãn (label)
// "có ý nghĩa" trước khi so khớp với shortName (vd. student.iuh.edu.vn ->
// bóc ".edu.vn" -> còn lại "student", "iuh").
const ORG_SUFFIXES = ["edu.vn", "com.vn", "org.vn", "gov.vn", "net.vn", "ac.vn", "vn", "com", "org", "net", "edu", "gov"];

function stripOrgSuffix(domain: string): string {
  for (const suffix of ORG_SUFFIXES) {
    if (domain === suffix) return "";
    if (domain.endsWith(`.${suffix}`)) {
      return domain.slice(0, -(suffix.length + 1));
    }
  }
  return domain;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // bỏ dấu tiếng Việt (combining marks sau NFD)
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
}

// VietQR business lookup response shape (https://api.vietqr.io/v2/business/:taxCode).
interface VietQrResponse {
  code: string;
  desc: string;
  data?: { id: string; name: string; internationalName?: string; shortName: string; address?: string };
}

export class CompanyVerificationService {
  private readonly config: VerificationConfig;

  constructor({ config: appConfig }: { config: VerificationConfig }) {
    this.config = appConfig;
  }

  isCommonEmailDomain(email: string): boolean {
    const domain = this.extractDomain(email);
    return this.config.COMMON_EMAIL_DOMAINS.includes(domain);
  }

  extractDomain(email: string): string {
    return email.trim().toLowerCase().split("@")[1] ?? "";
  }

  async hasMxRecord(domain: string): Promise<boolean> {
    try {
      const records = await dns.resolveMx(domain);
      return records.length > 0;
    } catch {
      return false;
    }
  }

  async lookupTaxCode(
    taxCode: string,
  ): Promise<{ status: "FOUND"; shortName: string } | { status: "INVALID" } | { status: "NOT_FOUND" } | { status: "LOOKUP_FAILED" }> {
    try {
      const response = await fetch(`${this.config.VIETQR_API_URL}/${encodeURIComponent(taxCode)}`);
      if (!response.ok) {
        return { status: "LOOKUP_FAILED" };
      }

      const body = (await response.json()) as VietQrResponse;
      if (body.code === "51") return { status: "INVALID" };
      if (body.code === "52") return { status: "NOT_FOUND" };
      if (body.code === "00" && body.data?.shortName) {
        return { status: "FOUND", shortName: body.data.shortName };
      }
      return { status: "LOOKUP_FAILED" };
    } catch {
      return { status: "LOOKUP_FAILED" };
    }
  }

  // Heuristic best-effort: thử MỌI nhãn còn lại sau khi bóc đuôi tổ chức (không
  // chỉ cấp 1/2 theo vị trí) — false negative rơi về xác thực thủ công (an
  // toàn), ưu tiên tránh false positive (tự động xác thực nhầm công ty).
  domainMatchesShortName(domain: string, shortName: string): boolean {
    const core = stripOrgSuffix(domain);
    if (!core) return false;

    const normalizedShortName = normalize(shortName);
    if (!normalizedShortName) return false;

    const labels = core.split(".").filter(Boolean);
    return labels.some((label) => {
      const normalizedLabel = normalize(label);
      if (!normalizedLabel) return false;
      return normalizedShortName.includes(normalizedLabel) || normalizedLabel.includes(normalizedShortName);
    });
  }

  async runVerificationCheck(params: { email: string; taxCode: string }): Promise<VerificationOutcome> {
    if (this.isCommonEmailDomain(params.email)) {
      return { outcome: "NEEDS_MANUAL_REVIEW", reason: "COMMON_EMAIL_DOMAIN" };
    }

    const domain = this.extractDomain(params.email);
    const hasMx = await this.hasMxRecord(domain);
    if (!hasMx) {
      return { outcome: "BLOCKED", reason: "NO_MAIL_SERVER" };
    }

    const lookup = await this.lookupTaxCode(params.taxCode);
    switch (lookup.status) {
      case "INVALID":
        return { outcome: "BLOCKED", reason: "TAX_CODE_INVALID" };
      case "NOT_FOUND":
        return { outcome: "BLOCKED", reason: "TAX_CODE_NOT_FOUND" };
      case "LOOKUP_FAILED":
        return { outcome: "BLOCKED", reason: "TAX_LOOKUP_FAILED" };
      case "FOUND": {
        const { shortName } = lookup;
        if (this.domainMatchesShortName(domain, shortName)) {
          return { outcome: "AUTO_VERIFIED", shortName };
        }
        return { outcome: "NEEDS_MANUAL_REVIEW", reason: "DOMAIN_MISMATCH", shortName };
      }
    }
  }
}
