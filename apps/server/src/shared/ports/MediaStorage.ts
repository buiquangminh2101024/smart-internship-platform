// Boundary lưu trữ media (INITIAL_ARCHITECTURE_PLAN.md §7) — module nghiệp vụ
// (employers, sau này cv/students) chỉ gọi qua interface này, không import
// trực tiếp SDK Cloudinary.
export interface UploadedFile {
  url: string;
  publicId: string;
}

export interface MediaStorage {
  upload(buffer: Buffer, options: { folder: string; filename?: string }): Promise<UploadedFile>;
}
