import { v2 as cloudinary } from "cloudinary";
import type { MediaStorage, UploadedFile } from "../shared/ports/MediaStorage";
import { AppError } from "../shared/errors/AppError";

interface CloudinaryConfig {
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
}

// Không cấu hình SDK Cloudinary trong constructor — cùng lý do với
// ResendEmailSender (resolve-eager qua awilix ngay cả khi upload() không bao
// giờ được gọi ở luồng chưa cấu hình Cloudinary thật). Cấu hình lười trong
// upload().
export class CloudinaryMediaStorage implements MediaStorage {
  private readonly cloudinaryConfig: CloudinaryConfig;

  constructor({ config: appConfig }: { config: CloudinaryConfig }) {
    this.cloudinaryConfig = appConfig;
  }

  async upload(buffer: Buffer, options: { folder: string; filename?: string }): Promise<UploadedFile> {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = this.cloudinaryConfig;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      throw new AppError(500, "Cloudinary is not configured");
    }

    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
    });

    return new Promise<UploadedFile>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: options.folder, resource_type: "auto", ...(options.filename ? { public_id: options.filename } : {}) },
        (error, result) => {
          if (error || !result) {
            reject(new AppError(502, `Failed to upload file: ${error?.message ?? "unknown error"}`));
            return;
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      uploadStream.end(buffer);
    });
  }
}
