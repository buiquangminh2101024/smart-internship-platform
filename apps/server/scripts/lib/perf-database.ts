// Chuỗi kết nối tới branch Neon đo hiệu năng (docs/06-backend/admin-audit-log/PLAN.md L25).
// Dừng ngay nếu thiếu `PERF_DATABASE_URL` hoặc nó trỏ cùng host + database với
// `DATABASE_URL`, để script đo/sinh dữ liệu không bao giờ ghi vào DB đang dùng.
// Không in giá trị của hai biến (có mật khẩu).

function hostAndDatabase(url: string, name: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.toLowerCase()}${parsed.pathname}`;
  } catch {
    throw new Error(`${name} không phải chuỗi kết nối hợp lệ`);
  }
}

export function requirePerfDatabaseUrl(): string {
  const perfUrl = process.env.PERF_DATABASE_URL?.trim();
  if (!perfUrl) {
    throw new Error("Thiếu PERF_DATABASE_URL (branch Neon đo hiệu năng) — dừng.");
  }
  const mainUrl = process.env.DATABASE_URL?.trim();
  if (mainUrl && hostAndDatabase(perfUrl, "PERF_DATABASE_URL") === hostAndDatabase(mainUrl, "DATABASE_URL")) {
    throw new Error("PERF_DATABASE_URL trùng host + database với DATABASE_URL — dừng.");
  }
  return perfUrl;
}
