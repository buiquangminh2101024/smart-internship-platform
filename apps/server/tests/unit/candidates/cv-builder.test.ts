// Chạy: node --import tsx --test tests/unit/candidates/cv-builder.test.ts (từ apps/server)
// Unit test cho các phương thức CV Builder trong CvService:
// - uploadBuilderImage (ảnh avatar / minh họa tải lên trong builder)
// - saveBuilderCv (tạo mới hoặc cập nhật CV được thiết kế từ builder)
import { test } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../../../src/shared/errors/AppError";
import {
  CvService,
  ALLOWED_BUILDER_IMAGE_MIME_TYPES,
  ALLOWED_CV_MIME_TYPES,
} from "../../../src/modules/cv/cv.service";
import type { PrismaClient } from "@prisma/client";
import type { MediaStorage } from "../../../src/shared/ports/MediaStorage";
import type { CvExtractionPipelineService } from "../../../src/modules/cv/cv-extraction-pipeline.service";

interface MockPrismaState {
  candidate: { id: string; userId: string } | null;
  cvs: Array<{
    id: string;
    candidateId: string;
    fileName: string;
    fileUrl: string;
    isDefault: boolean;
    isHidden: boolean;
    isBuilder?: boolean;
    templateId?: string | null;
    builderData?: any;
    uploadedAt: Date;
  }>;
}

function createMockCvService(initialState?: Partial<MockPrismaState>) {
  const state: MockPrismaState = {
    candidate: initialState?.candidate ?? { id: "cand-1", userId: "user-cand-1" },
    cvs: initialState?.cvs ? [...initialState.cvs] : [],
  };

  const uploadCalls: Array<{ buffer: Buffer; options: any }> = [];

  const mediaStorage: MediaStorage = {
    upload: async (buffer: Buffer, options: any) => {
      uploadCalls.push({ buffer, options });
      return { url: `https://storage.example.com/${options.folder}/${options.filename}` };
    },
  };

  const prisma = {
    candidate: {
      findUnique: async ({ where }: { where: { userId: string } }) => {
        if (state.candidate && state.candidate.userId === where.userId) {
          return state.candidate;
        }
        return null;
      },
      create: async ({ data }: { data: { userId: string } }) => {
        const created = { id: `cand-new-${Date.now()}`, userId: data.userId };
        state.candidate = created;
        return created;
      },
    },
    cv: {
      findFirst: async ({ where }: { where: { id?: string; candidateId?: string } }) => {
        return (
          state.cvs.find((cv) => {
            if (where.id && cv.id !== where.id) return false;
            if (where.candidateId && cv.candidateId !== where.candidateId) return false;
            return true;
          }) || null
        );
      },
      create: async ({ data }: { data: any }) => {
        const newCv = {
          id: `cv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          uploadedAt: new Date(),
          ...data,
        };
        state.cvs.push(newCv);
        return newCv;
      },
      update: async ({ where, data }: { where: { id: string }; data: any }) => {
        const index = state.cvs.findIndex((cv) => cv.id === where.id);
        if (index === -1) throw new Error("Record to update not found");
        state.cvs[index] = { ...state.cvs[index], ...data };
        return state.cvs[index];
      },
    },
  } as unknown as PrismaClient;

  const cvExtractionPipelineService = {} as CvExtractionPipelineService;

  const service = new CvService({
    prisma,
    mediaStorage,
    cvExtractionPipelineService,
  });

  return { service, state, uploadCalls };
}

function createFakeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: "cv-builder.pdf",
    encoding: "7bit",
    mimetype: "application/pdf",
    size: 1024 * 50, // 50 KB
    buffer: Buffer.from("dummy pdf content"),
    destination: "",
    filename: "cv-builder.pdf",
    path: "",
    stream: null as any,
    ...overrides,
  };
}

// ==========================================
// Test suite 1: Constants & MIME validation
// ==========================================

test("ALLOWED_BUILDER_IMAGE_MIME_TYPES: chỉ cho phép JPG và PNG cho @react-pdf/renderer", () => {
  assert.equal(ALLOWED_BUILDER_IMAGE_MIME_TYPES.length, 2);
  assert.ok(ALLOWED_BUILDER_IMAGE_MIME_TYPES.includes("image/jpeg"));
  assert.ok(ALLOWED_BUILDER_IMAGE_MIME_TYPES.includes("image/png"));
  assert.ok(!ALLOWED_BUILDER_IMAGE_MIME_TYPES.includes("image/webp"));
  assert.ok(!ALLOWED_BUILDER_IMAGE_MIME_TYPES.includes("image/svg+xml"));
});

test("ALLOWED_CV_MIME_TYPES: chấp nhận PDF, DOCX, DOC, JPG, PNG", () => {
  assert.ok(ALLOWED_CV_MIME_TYPES.includes("application/pdf"));
  assert.ok(ALLOWED_CV_MIME_TYPES.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
  assert.ok(ALLOWED_CV_MIME_TYPES.includes("image/png"));
  assert.ok(!ALLOWED_CV_MIME_TYPES.includes("text/plain"));
});

// ==========================================
// Test suite 2: uploadBuilderImage
// ==========================================

test("uploadBuilderImage: không truyền file → ném lỗi 400", async () => {
  const { service } = createMockCvService();
  await assert.rejects(
    () => service.uploadBuilderImage("user-cand-1", undefined),
    (err: unknown) => err instanceof AppError && err.statusCode === 400 && err.message === "An image file is required",
  );
});

test("uploadBuilderImage: file quá dung lượng 2MB → ném lỗi 400", async () => {
  const { service } = createMockCvService();
  const oversizedFile = createFakeFile({
    mimetype: "image/png",
    size: 2 * 1024 * 1024 + 1, // 2MB + 1 byte
  });

  await assert.rejects(
    () => service.uploadBuilderImage("user-cand-1", oversizedFile),
    (err: unknown) => err instanceof AppError && err.statusCode === 400 && err.message === "Image size must be under 2MB",
  );
});

test("uploadBuilderImage: định dạng không hỗ trợ (vd: webp, pdf) → ném lỗi 400", async () => {
  const { service } = createMockCvService();
  const webpFile = createFakeFile({
    mimetype: "image/webp",
    size: 100 * 1024,
  });

  await assert.rejects(
    () => service.uploadBuilderImage("user-cand-1", webpFile),
    (err: unknown) => err instanceof AppError && err.statusCode === 400 && err.message === "Only JPG or PNG images are allowed",
  );
});

test("uploadBuilderImage: file ảnh JPG/PNG hợp lệ → lưu vào candidate-cv-images và trả về URL", async () => {
  const { service, uploadCalls } = createMockCvService();
  const validImage = createFakeFile({
    originalname: "avatar.png",
    mimetype: "image/png",
    size: 300 * 1024,
  });

  const result = await service.uploadBuilderImage("user-cand-1", validImage);
  assert.ok(result.url.includes("candidate-cv-images"));
  assert.equal(uploadCalls.length, 1);
  assert.equal(uploadCalls[0].options.folder, "candidate-cv-images");
  assert.equal(uploadCalls[0].options.resourceType, "image");
});

// ==========================================
// Test suite 3: saveBuilderCv (Tạo mới)
// ==========================================

test("saveBuilderCv (tạo mới): thiếu file PDF được render → ném lỗi 400", async () => {
  const { service } = createMockCvService();
  await assert.rejects(
    () => service.saveBuilderCv("user-cand-1", undefined, "classic", { personal: { fullName: "A" } }, undefined),
    (err: unknown) =>
      err instanceof AppError &&
      err.statusCode === 400 &&
      err.message === "A generated PDF file is required when creating a new Builder CV",
  );
});

test("saveBuilderCv (tạo mới): dung lượng file PDF > 5MB → ném lỗi 400", async () => {
  const { service } = createMockCvService();
  const hugeFile = createFakeFile({
    size: 5 * 1024 * 1024 + 10,
  });

  await assert.rejects(
    () => service.saveBuilderCv("user-cand-1", undefined, "classic", { personal: { fullName: "A" } }, hugeFile),
    (err: unknown) => err instanceof AppError && err.statusCode === 400 && err.message === "CV file size must be under 5MB",
  );
});

test("saveBuilderCv (tạo mới): định dạng file không thuộc danh sách ALLOWED_CV_MIME_TYPES → ném lỗi 400", async () => {
  const { service } = createMockCvService();
  const invalidMimeFile = createFakeFile({
    mimetype: "application/zip",
  });

  await assert.rejects(
    () => service.saveBuilderCv("user-cand-1", undefined, "classic", { personal: { fullName: "A" } }, invalidMimeFile),
    (err: unknown) =>
      err instanceof AppError &&
      err.statusCode === 400 &&
      err.message === "Only PDF, DOCX, JPG or PNG files are allowed for CV upload",
  );
});

test("saveBuilderCv (tạo mới): tạo CV thành công với cờ isBuilder = true và builderData lưu đúng", async () => {
  const { service, state, uploadCalls } = createMockCvService();
  const pdfFile = createFakeFile({
    originalname: "my-cv.pdf",
    mimetype: "application/pdf",
    size: 80 * 1024,
  });

  const builderPayload = {
    personal: { fullName: "Nguyen Van B", headline: "Fullstack Dev" },
    summary: "Kinh nghiệm 3 năm",
    experiences: [],
    educations: [],
    projects: [],
    skills: [{ id: "sk1", name: "Node.js" }],
    certificates: [],
    sectionOrder: ["personal", "summary", "skills"],
  };

  const createdCv = await service.saveBuilderCv("user-cand-1", undefined, "modern", builderPayload, pdfFile);

  assert.ok(createdCv.id);
  assert.equal(createdCv.isBuilder, true);
  assert.equal(createdCv.templateId, "modern");
  assert.deepEqual(createdCv.builderData, builderPayload);
  assert.equal(createdCv.fileName, "my-cv.pdf");
  assert.ok(createdCv.fileUrl.includes("candidate-cvs"));
  assert.equal(createdCv.isDefault, false);
  assert.equal(createdCv.isHidden, false);

  // Kiểm tra file được upload lên storage
  assert.equal(uploadCalls.length, 1);
  assert.equal(uploadCalls[0].options.folder, "candidate-cvs");
  assert.equal(uploadCalls[0].options.resourceType, "raw");

  // Kiểm tra đã lưu vào DB mock
  assert.equal(state.cvs.length, 1);
  assert.equal(state.cvs[0].isBuilder, true);
});

test("saveBuilderCv (tạo mới): tự động tạo candidate nếu tài khoản chưa có bản ghi candidate", async () => {
  const { service, state } = createMockCvService({ candidate: null });
  const pdfFile = createFakeFile();

  const created = await service.saveBuilderCv("user-cand-new", undefined, "minimal", { personal: {} }, pdfFile);

  assert.ok(created);
  assert.ok(state.candidate);
  assert.equal(state.candidate?.userId, "user-cand-new");
});

// ==========================================
// Test suite 4: saveBuilderCv (Cập nhật)
// ==========================================

test("saveBuilderCv (cập nhật): CV không tồn tại → ném lỗi 404", async () => {
  const { service } = createMockCvService();

  await assert.rejects(
    () => service.saveBuilderCv("user-cand-1", "non-existent-cv-id", "classic", {}, undefined),
    (err: unknown) => err instanceof AppError && err.statusCode === 404 && err.message === "CV not found",
  );
});

test("saveBuilderCv (cập nhật): CV tồn tại nhưng không phải do Builder tạo (isBuilder = false) → ném lỗi 400", async () => {
  const existingCv = {
    id: "uploaded-cv-1",
    candidateId: "cand-1",
    fileName: "scan.pdf",
    fileUrl: "https://storage.example.com/scan.pdf",
    isDefault: false,
    isHidden: false,
    isBuilder: false, // File tải lên thông thường, không phải từ builder
    uploadedAt: new Date(),
  };

  const { service } = createMockCvService({ cvs: [existingCv] });

  await assert.rejects(
    () => service.saveBuilderCv("user-cand-1", "uploaded-cv-1", "classic", {}, undefined),
    (err: unknown) =>
      err instanceof AppError &&
      err.statusCode === 400 &&
      err.message === "This CV was not created with the builder and cannot be edited here",
  );
});

test("saveBuilderCv (cập nhật): chỉ đổi nội dung & mẫu mà không nạp PDF mới → cập nhật DB không upload file", async () => {
  const existingCv = {
    id: "builder-cv-1",
    candidateId: "cand-1",
    fileName: "my-builder-cv.pdf",
    fileUrl: "https://storage.example.com/original.pdf",
    isDefault: true,
    isHidden: false,
    isBuilder: true,
    templateId: "classic",
    builderData: { personal: { fullName: "Tên cũ" } },
    uploadedAt: new Date(),
  };

  const { service, state, uploadCalls } = createMockCvService({ cvs: [existingCv] });

  const updatedData = { personal: { fullName: "Tên mới đã cập nhật" } };
  const result = await service.saveBuilderCv("user-cand-1", "builder-cv-1", "creative", updatedData, undefined);

  assert.equal(uploadCalls.length, 0); // Không upload lại
  assert.equal(result.templateId, "creative");
  assert.deepEqual(result.builderData, updatedData);
  assert.equal(result.fileUrl, "https://storage.example.com/original.pdf"); // Giữ nguyên fileUrl cũ
  assert.equal(state.cvs[0].templateId, "creative");
});

test("saveBuilderCv (cập nhật): kèm file PDF mới → upload file mới và cập nhật cả fileUrl & fileName", async () => {
  const existingCv = {
    id: "builder-cv-2",
    candidateId: "cand-1",
    fileName: "old-cv.pdf",
    fileUrl: "https://storage.example.com/old-cv.pdf",
    isDefault: false,
    isHidden: false,
    isBuilder: true,
    templateId: "classic",
    builderData: { personal: {} },
    uploadedAt: new Date(),
  };

  const { service, state, uploadCalls } = createMockCvService({ cvs: [existingCv] });

  const newFile = createFakeFile({
    originalname: "cv-updated-v2.pdf",
  });

  const result = await service.saveBuilderCv("user-cand-1", "builder-cv-2", "professional", { personal: { fullName: "V2" } }, newFile);

  assert.equal(uploadCalls.length, 1);
  assert.equal(result.templateId, "professional");
  assert.equal(result.fileName, "cv-updated-v2.pdf");
  assert.notEqual(result.fileUrl, "https://storage.example.com/old-cv.pdf");
  assert.ok(result.fileUrl.includes("candidate-cvs"));
  assert.equal(state.cvs[0].fileName, "cv-updated-v2.pdf");
});
