import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { inflateRawSync } from "node:zlib";
import { PrismaClient } from "@prisma/client";
import { normalizeMajorName, normalizeUniversityName } from "../src/modules/education-catalog/education-catalog-normalize.util";

// Nạp trực tiếp University/Major từ dữ liệu tuyển sinh thật (xem
// docs/06-backend/cv-ai-extraction-phase2/PLAN.md Phần 3, bước 13) — giảm số
// lượng PENDING phát sinh khi Candidate import CV. Mặc định đọc 2 file nguồn
// trong `docs/designs/`, hoặc truyền đường dẫn khác qua 2 tham số dòng lệnh.
//
// Nguồn: `school_list.csv` (danh sách trường, cột code/name/url) và
// `school_major_list.xlsx` (điểm chuẩn theo từng trường-ngành, cột CODE /
// UNIVERSITY / MAJOR_CODE / MAJOR / ...).
//
// Không dùng package `xlsx` (SheetJS) từ npm: bản trên npm registry (0.18.5)
// còn 2 CVE prototype-pollution/ReDoS chưa có bản vá (xem `npm audit`). File
// .xlsx chỉ là zip chứa XML nên tự đọc tối thiểu phần cần (sharedStrings +
// sheet đầu tiên) bằng zlib có sẵn của Node.

const prisma = new PrismaClient();

const DEFAULT_CSV_PATH = path.resolve(__dirname, "../../../docs/designs/school_list.csv");
const DEFAULT_XLSX_PATH = path.resolve(__dirname, "../../../docs/designs/school_major_list.xlsx");

// ─── Đọc .xlsx tối thiểu (không cần thư viện ngoài) ────────────────────────

function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const EOCD_SIGNATURE = 0x06054b50;
  const CENTRAL_DIR_SIGNATURE = 0x02014b50;

  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Không đọc được file .xlsx (không phải zip hợp lệ)");

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);

  const entries = new Map<string, Buffer>();
  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error("File .xlsx bị lỗi cấu trúc zip (central directory)");
    }
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength);

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const rawData = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.set(fileName, compressionMethod === 0 ? Buffer.from(rawData) : inflateRawSync(rawData));

    offset += 46 + fileNameLength + extraFieldLength + commentLength;
  }
  return entries;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const siRegex = /<si>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = siRegex.exec(xml))) {
    const texts = [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]);
    strings.push(decodeXmlEntities(texts.join("")));
  }
  return strings;
}

/** Đọc sheet đầu tiên của 1 file .xlsx đơn giản (1 sheet, có header dòng 1). */
function readXlsxFirstSheet(filePath: string): Record<string, string>[] {
  const entries = readZipEntries(readFileSync(filePath));

  const sharedStringsXml = entries.get("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml.toString("utf8")) : [];

  const sheetFileName = [...entries.keys()].find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!sheetFileName) throw new Error(`Không tìm thấy worksheet trong ${filePath}`);
  const sheetXml = entries.get(sheetFileName)!.toString("utf8");

  const rowRegex = /<row r="\d+"[^>]*>([\s\S]*?)<\/row>/g;
  const cellRegex = /<c r="([A-Z]+)\d+"( [^>]*)?>(?:<v>([\s\S]*?)<\/v>)?<\/c>/g;

  const rows: Record<string, string>[] = [];
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(sheetXml))) {
    const cells: Record<string, string> = {};
    cellRegex.lastIndex = 0;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
      const [, col, attrs, value] = cellMatch;
      if (value === undefined) continue;
      const isSharedString = attrs?.includes(' t="s"') ?? false;
      cells[col] = isSharedString ? (sharedStrings[Number(value)] ?? "") : decodeXmlEntities(value);
    }
    rows.push(cells);
  }

  const [headerRow, ...dataRows] = rows;
  if (!headerRow) return [];
  // map "tên cột" (dòng 1) -> chữ cái cột, để không phụ thuộc thứ tự cột cố định
  const columnNameByLetter = new Map(Object.entries(headerRow).map(([letter, name]) => [name.trim(), letter]));
  return dataRows.map((row) => {
    const obj: Record<string, string> = {};
    for (const [name, letter] of columnNameByLetter) obj[name] = (row[letter] ?? "").trim();
    return obj;
  });
}

// ─── Đọc school_list.csv (code,name,url — 3 cột, không có dấu phẩy trong url) ─

interface SchoolListRow {
  code: string;
  name: string;
}

function readSchoolListCsv(filePath: string): SchoolListRow[] {
  const raw = readFileSync(filePath, "utf8").replace(/^﻿/, "");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.slice(1).map((line) => {
    const firstComma = line.indexOf(",");
    const secondComma = line.indexOf(",", firstComma + 1);
    const code = line.slice(0, firstComma).trim();
    const rawName = line.slice(firstComma + 1, secondComma).trim();
    // Cột name gốc có dạng "CODE-Tên trường" — bỏ tiền tố mã trường.
    const prefix = `${code}-`;
    const name = rawName.startsWith(prefix) ? rawName.slice(prefix.length).trim() : rawName;
    return { code, name };
  });
}

// ─── Gộp thành danh sách University/Major cuối cùng ────────────────────────

interface MajorSheetRow {
  CODE: string;
  UNIVERSITY: string;
  MAJOR_CODE: string;
  MAJOR: string;
}

/** Vài trường thành viên của ĐHQG/ĐH vùng trùng tên sau khi rút gọn — thêm mã
 * trường vào tên để đảm bảo unique, không tự bịa tên phân biệt. */
function disambiguateDuplicateNames<T extends { name: string; disambiguator: string }>(items: T[]): T[] {
  const countByName = new Map<string, number>();
  for (const item of items) {
    const key = item.name.toLowerCase();
    countByName.set(key, (countByName.get(key) ?? 0) + 1);
  }
  return items.map((item) => {
    const key = item.name.toLowerCase();
    const isDuplicate = (countByName.get(key) ?? 0) > 1;
    return { ...item, name: isDuplicate ? `${item.name} (${item.disambiguator})` : item.name };
  });
}

function buildUniversities(csvRows: SchoolListRow[], majorSheetRows: MajorSheetRow[]) {
  const byCode = new Map<string, string>();
  for (const row of majorSheetRows) {
    const code = row.CODE.trim();
    const name = row.UNIVERSITY.trim();
    if (code && name && !byCode.has(code)) byCode.set(code, name);
  }
  // school_list.csv có thêm vài trường không xuất hiện trong dữ liệu điểm chuẩn.
  for (const row of csvRows) {
    if (row.code && row.name && !byCode.has(row.code)) byCode.set(row.code, row.name);
  }

  const items = [...byCode.entries()].map(([code, name]) => ({ code, name, disambiguator: code }));
  return disambiguateDuplicateNames(items).map(({ code, name }) => ({ code, name }));
}

/**
 * MAJOR_CODE trong file nguồn KHÔNG đáng tin để gộp trùng: cùng 1 ngành nhưng
 * mỗi trường tự ghi code khác nhau (hậu tố "_1", "_2"... lẫn cả hậu tố chữ
 * như "KMA"/"KMP", số dư ra...). Gộp theo MAJOR_NAME sau khi cắt phần chú
 * thích/chuyên ngành ở cuối tên mới đúng ý "cùng 1 ngành" cho hồ sơ Candidate.
 */
function stripTrailingAnnotations(name: string): string {
  let bare = name;
  let changed = true;
  while (changed) {
    const before = bare;
    bare = bare.replace(/\s*\([^()]*\)\s*$/, "").trim();
    bare = bare.replace(/,\s*chuyên ngành[^,]*$/i, "").trim();
    changed = bare !== before;
  }
  return bare;
}

// Dấu câu cẩu thả: ";", "&", khoảng trắng trước dấu phẩy, gạch nối dính chữ ("-An ninh").
function messiness(name: string): number {
  return (name.match(/;|&|\s,|\S[-–]|[-–]\S/g) ?? []).length;
}

function buildMajors(majorSheetRows: MajorSheetRow[]) {
  const variantCountByKey = new Map<string, Map<string, number>>();
  for (const row of majorSheetRows) {
    const rawName = row.MAJOR.normalize("NFC").trim().replace(/\s+/g, " ");
    if (!rawName) continue;
    const bareName = stripTrailingAnnotations(rawName).replace(/^ngành\s+/i, "");
    if (!bareName) continue;
    // Khoá gộp = đúng hàm chuẩn hoá mà pipeline dedupe dùng lúc so khớp, để
    // "Tài chính - Ngân hàng" / "Tài chính – Ngân hàng" / "Ngành Tài chính ngân
    // hàng" chỉ ra MỘT ngành, không phải ba.
    const key = normalizeMajorName(bareName);
    if (!key) continue;
    const variants = variantCountByKey.get(key) ?? new Map<string, number>();
    variants.set(bareName, (variants.get(bareName) ?? 0) + 1);
    variantCountByKey.set(key, variants);
  }

  return [...variantCountByKey.values()].map((variants) => {
    // Tên hiển thị = biến thể xuất hiện nhiều nhất (thường đúng chính tả/viết
    // hoa chuẩn nhất); hoà thì ưu tiên dấu câu gọn, rồi tên ngắn hơn.
    const [name] = [...variants.entries()].sort(
      (a, b) =>
        b[1] - a[1] || messiness(a[0]) - messiness(b[0]) || a[0].length - b[0].length || a[0].localeCompare(b[0]),
    )[0]!;
    return { name };
  });
}

// ─── main ───────────────────────────────────────────────────────────────

async function main() {
  const csvPath = process.argv[2] ?? DEFAULT_CSV_PATH;
  const xlsxPath = process.argv[3] ?? DEFAULT_XLSX_PATH;

  for (const filePath of [csvPath, xlsxPath]) {
    if (!existsSync(filePath)) {
      throw new Error(
        `Không tìm thấy file "${filePath}". Đặt 2 file school_list.csv và school_major_list.xlsx vào docs/designs/, ` +
          `hoặc chạy: tsx scripts/seed-education-catalog.ts <đường-dẫn-csv> <đường-dẫn-xlsx>`,
      );
    }
  }

  const csvRows = readSchoolListCsv(csvPath);
  const majorSheetRows = readXlsxFirstSheet(xlsxPath) as unknown as MajorSheetRow[];

  const universities = buildUniversities(csvRows, majorSheetRows);
  const majors = buildMajors(majorSheetRows);

  // skipDuplicates chỉ chặn trùng ĐÚNG từng ký tự trên name/code. Bỏ thêm mục
  // đã có trong DB dưới cách viết khác (hoa/thường, dấu gạch, "Ngành ..."), hoặc
  // đã bị Admin gộp thành alias — nếu không, chạy lại script sẽ đẻ lại bản trùng.
  const [existingUniversities, universityAliases, existingMajors, majorAliases] = await Promise.all([
    prisma.university.findMany({ select: { name: true, code: true } }),
    prisma.universityAlias.findMany({ select: { alias: true } }),
    prisma.major.findMany({ select: { name: true } }),
    prisma.majorAlias.findMany({ select: { alias: true } }),
  ]);
  const knownUniversityCodes = new Set(existingUniversities.flatMap((u) => (u.code ? [u.code] : [])));
  const knownUniversityKeys = new Set([
    ...existingUniversities.map((u) => normalizeUniversityName(u.name)),
    ...universityAliases.map((a) => a.alias),
  ]);
  const knownMajorKeys = new Set([...existingMajors.map((m) => normalizeMajorName(m.name)), ...majorAliases.map((a) => a.alias)]);

  const newUniversities = universities.filter(
    (u) => !knownUniversityCodes.has(u.code) && !knownUniversityKeys.has(normalizeUniversityName(u.name)),
  );
  const newMajors = majors.filter((m) => !knownMajorKeys.has(normalizeMajorName(m.name)));

  const universityResult = await prisma.university.createMany({ data: newUniversities, skipDuplicates: true });
  const majorResult = await prisma.major.createMany({ data: newMajors, skipDuplicates: true });

  console.log(`Universities: ${universities.length} distinct trong dữ liệu nguồn, đã thêm mới ${universityResult.count} (còn lại đã tồn tại).`);
  console.log(`Majors: ${majors.length} distinct trong dữ liệu nguồn, đã thêm mới ${majorResult.count} (còn lại đã tồn tại).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
