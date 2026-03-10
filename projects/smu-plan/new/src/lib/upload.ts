import { randomUUID } from "crypto";
import { mkdir, writeFile, rm } from "fs/promises";
import path from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");

export interface UploadRules {
  maxSize: number;
  allowedTypes: string[];
}

export const AVATAR_RULES: UploadRules = {
  maxSize: 2 * 1024 * 1024, // 2MB
  allowedTypes: ["image/jpeg", "image/png", "image/webp"],
};

export const ARTICLE_IMAGE_RULES: UploadRules = {
  maxSize: 5 * 1024 * 1024, // 5MB
  allowedTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
};

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export class UploadError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "UploadError";
    this.status = status;
  }
}

export function validateFile(file: File, rules: UploadRules): void {
  if (!file || !(file instanceof File)) {
    throw new UploadError("缺少文件", 400);
  }
  if (file.size === 0) {
    throw new UploadError("文件为空", 400);
  }
  if (file.size > rules.maxSize) {
    const maxMB = Math.round(rules.maxSize / 1024 / 1024);
    throw new UploadError(`文件大小超过 ${maxMB}MB 限制`, 413);
  }
  if (!rules.allowedTypes.includes(file.type)) {
    throw new UploadError(`不支持的文件类型: ${file.type}`, 415);
  }
  const ext = MIME_TO_EXT[file.type];
  if (!ext) {
    throw new UploadError("无法识别的文件类型", 415);
  }
}

export async function saveFile(file: File, subdir: string): Promise<string> {
  const ext = MIME_TO_EXT[file.type];
  const name = `${randomUUID()}.${ext}`;
  const dir = path.join(UPLOAD_DIR, subdir);
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, name), buffer);
  return `/uploads/${subdir}/${name}`;
}

export async function deleteFile(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith("/uploads/")) return;
  const relativePath = url.replace(/^\/uploads\//, "");
  const filePath = path.join(UPLOAD_DIR, relativePath);
  try {
    await rm(filePath, { force: true });
  } catch {
    // Log but don't throw - cleanup failure shouldn't break the operation
    console.warn(`Failed to delete file: ${filePath}`);
  }
}
