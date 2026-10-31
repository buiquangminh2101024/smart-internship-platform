import Link from "next/link";
import type { ReactNode } from "react";

// Định dạng câu trả lời của trợ lý (docs/05-frontend/phases/support-chatbot/PLAN.md, quyết định 7).
// Chỉ hiểu: đoạn văn, dòng bắt đầu bằng "- ", **đậm** và đường dẫn nội bộ viết trần (/applications).
// Mọi thứ khác là text thường — React tự escape, không dùng dangerouslySetInnerHTML.

// Đường dẫn bắt đầu bằng "/" đứng sau đầu dòng, khoảng trắng hoặc ngoặc — không bắt "tỉnh/thành".
const INTERNAL_PATH = /(^|[\s("'“])(\/[A-Za-z0-9][A-Za-z0-9\-._~/?=&%#]*)/g;
const TRAILING_PUNCTUATION = /[.,;:!?)]+$/;
const BOLD = /\*\*(.+?)\*\*/g;

function linkify(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(INTERNAL_PATH)) {
    const lead = match[1] ?? "";
    const rawPath = match[2] ?? "";
    const path = rawPath.replace(TRAILING_PUNCTUATION, "");
    if (path.length < 2) continue;
    const start = (match.index ?? 0) + lead.length;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    nodes.push(
      <Link key={`${keyPrefix}-${start}`} href={path} className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800">
        {path}
      </Link>,
    );
    cursor = start + path.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(BOLD)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(...linkify(text.slice(cursor, start), `${keyPrefix}-t${cursor}`));
    nodes.push(
      <strong key={`${keyPrefix}-b${start}`} className="font-semibold text-text-strong">
        {linkify(match[1] ?? "", `${keyPrefix}-b${start}`)}
      </strong>,
    );
    cursor = start + match[0].length;
  }
  if (cursor < text.length) nodes.push(...linkify(text.slice(cursor), `${keyPrefix}-t${cursor}`));
  return nodes;
}

/** Văn bản → đoạn văn và danh sách gạch đầu dòng. */
export function formatSupportChatAnswer(text: string): ReactNode {
  const blocks: ReactNode[] = [];
  const paragraphs = text.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/);
  paragraphs.forEach((paragraph, paragraphIndex) => {
    let lines: string[] = [];
    let items: string[] = [];
    const flushLines = () => {
      if (lines.length === 0) return;
      const key = `p${paragraphIndex}-${blocks.length}`;
      blocks.push(
        <p key={key} className="whitespace-pre-line">
          {inline(lines.join("\n"), key)}
        </p>,
      );
      lines = [];
    };
    const flushItems = () => {
      if (items.length === 0) return;
      const key = `l${paragraphIndex}-${blocks.length}`;
      blocks.push(
        <ul key={key} className="list-disc space-y-1 pl-5">
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{inline(item, `${key}-${itemIndex}`)}</li>
          ))}
        </ul>,
      );
      items = [];
    };
    for (const line of paragraph.split("\n")) {
      const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
      if (bullet) {
        flushLines();
        items.push(bullet[1] ?? "");
      } else {
        flushItems();
        lines.push(line);
      }
    }
    flushLines();
    flushItems();
  });
  return <div className="space-y-2">{blocks}</div>;
}
