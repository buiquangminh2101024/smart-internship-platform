export interface ExtractedText {
  text: string;
  // null khi định dạng không cho biết số trang (DOCX).
  pageCount: number | null;
}

// import() động: pdf-parse kéo theo cả pdfjs, mammoth cũng không nhẹ — chỉ nạp
// khi thật sự có người bấm "Phân tích CV", không làm chậm lúc server khởi động.

export async function extractPdfText(buffer: Buffer): Promise<ExtractedText> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    // Bỏ dấu phân trang mặc định ("-- 1 of 2 --") để không lẫn vào nội dung
    // gửi cho LLM và không làm sai phép đếm ký tự của quality gate.
    const result = await parser.getText({ pageJoiner: "" });
    return { text: result.text, pageCount: result.total };
  } finally {
    await parser.destroy();
  }
}

export async function extractDocxText(buffer: Buffer): Promise<ExtractedText> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value, pageCount: null };
}
