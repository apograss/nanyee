import { randomUUID } from "crypto";
import { mkdir, writeFile, rm } from "fs/promises";
import path from "path";

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
  type ObjectCannedACL,
} from "@aws-sdk/client-s3";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.S3_REGION || "us-east-1";
const S3_OBJECT_ACL = (process.env.S3_OBJECT_ACL || "public-read") as ObjectCannedACL;

export interface UploadRules {
  maxSize: number;
  allowedTypes: string[];
}

export const AVATAR_RULES: UploadRules = {
  maxSize: 2 * 1024 * 1024,
  allowedTypes: ["image/jpeg", "image/png", "image/webp"],
};

export const ARTICLE_IMAGE_RULES: UploadRules = {
  maxSize: 5 * 1024 * 1024,
  allowedTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
};

export const ARTICLE_ATTACHMENT_RULES: UploadRules = {
  maxSize: 20 * 1024 * 1024,
  allowedTypes: [
    "application/pdf",
    "text/plain",
    "application/zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
};

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/zip": "zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

type StorageArea = "wiki-images" | "wiki-attachments" | "avatars";

interface SaveFileOptions {
  originalName?: string;
}

const STORAGE_AREA_MAP: Record<string, StorageArea> = {
  articles: "wiki-images",
  "wiki-images": "wiki-images",
  "wiki-attachments": "wiki-attachments",
  avatars: "avatars",
};

const LOCAL_SUBDIR_MAP: Record<StorageArea, string> = {
  "wiki-images": "articles",
  "wiki-attachments": "attachments",
  avatars: "avatars",
};

const S3_PREFIX_MAP: Record<StorageArea, string> = {
  "wiki-images": "wiki/images",
  "wiki-attachments": "wiki/attachments",
  avatars: "avatars",
};

let s3Client: S3Client | null = null;

export class UploadError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UploadError";
    this.status = status;
  }
}

export function isSafeUploadPath(
  uploadDir: string,
  segments: string[],
): string | null {
  const root = path.resolve(uploadDir);
  const candidate = path.resolve(path.join(root, ...segments));
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (candidate === root || candidate.startsWith(rootPrefix)) {
    return candidate;
  }

  return null;
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

function normalizeStorageArea(input: string): StorageArea {
  const normalized = STORAGE_AREA_MAP[input];
  if (!normalized) {
    throw new UploadError(`未知上传目录: ${input}`, 500);
  }
  return normalized;
}

function isS3Configured() {
  return Boolean(S3_ENDPOINT && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY && S3_BUCKET);
}

function getS3Client(): S3Client {
  if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new UploadError("S3 存储配置不完整", 500);
  }

  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: S3_ACCESS_KEY_ID,
        secretAccessKey: S3_SECRET_ACCESS_KEY,
      },
    });
  }

  return s3Client;
}

function sanitizeFileName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, "-");
  const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return sanitized.replace(/^-+|-+$/g, "") || "file";
}

function buildGeneratedFileName(file: File, area: StorageArea, options?: SaveFileOptions) {
  if (area === "wiki-attachments") {
    const originalName = options?.originalName || file.name || "attachment";
    return `${randomUUID()}-${sanitizeFileName(originalName)}`;
  }

  const ext = MIME_TO_EXT[file.type];
  return `${randomUUID()}.${ext}`;
}

export function buildStorageObjectKey(area: StorageArea, fileName: string) {
  return `${S3_PREFIX_MAP[area]}/${fileName}`;
}

export function buildStoragePublicUrl(endpoint: string, bucket: string, objectKey: string) {
  const normalizedEndpoint = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
  const normalizedKey = objectKey.replace(/^\/+/, "");
  return `${normalizedEndpoint}/${bucket}/${normalizedKey}`;
}

function getStorageBaseUrl() {
  if (!S3_ENDPOINT || !S3_BUCKET) {
    return null;
  }
  return buildStoragePublicUrl(S3_ENDPOINT, S3_BUCKET, "");
}

async function saveToLocal(file: File, area: StorageArea) {
  const name = buildGeneratedFileName(file, area);
  const dir = path.join(UPLOAD_DIR, LOCAL_SUBDIR_MAP[area]);
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, name), buffer);
  return `/uploads/${LOCAL_SUBDIR_MAP[area]}/${name}`;
}

async function saveToS3(file: File, area: StorageArea, options?: SaveFileOptions) {
  if (!S3_BUCKET) {
    throw new UploadError("S3 bucket 未配置", 500);
  }

  const name = buildGeneratedFileName(file, area, options);
  const objectKey = buildStorageObjectKey(area, name);
  const client = getS3Client();
  const buffer = Buffer.from(await file.arrayBuffer());

  await client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: objectKey,
      Body: buffer,
      ContentType: file.type,
      ACL: S3_OBJECT_ACL,
    }),
  );

  return buildStoragePublicUrl(S3_ENDPOINT!, S3_BUCKET, objectKey);
}

export async function saveFile(
  file: File,
  subdir: string,
  options?: SaveFileOptions,
): Promise<string> {
  const area = normalizeStorageArea(subdir);

  if (isS3Configured()) {
    return saveToS3(file, area, options);
  }

  return saveToLocal(file, area);
}

async function deleteLocalFile(url: string) {
  if (!url.startsWith("/uploads/")) return;
  const relativePath = url.replace(/^\/uploads\//, "");
  const filePath = path.join(UPLOAD_DIR, relativePath);
  await rm(filePath, { force: true });
}

function getObjectKeyFromUrl(url: string) {
  const base = getStorageBaseUrl();
  if (!base) {
    return null;
  }
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  if (!url.startsWith(normalizedBase)) {
    return null;
  }
  return url.slice(normalizedBase.length).replace(/^\/+/, "");
}

async function deleteS3File(url: string) {
  if (!S3_BUCKET) {
    return;
  }

  const objectKey = getObjectKeyFromUrl(url);
  if (!objectKey) {
    return;
  }

  const client = getS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: objectKey,
    }),
  );
}

export async function deleteFile(url: string | null | undefined): Promise<void> {
  if (!url) return;

  try {
    if (url.startsWith("/uploads/")) {
      await deleteLocalFile(url);
      return;
    }

    if (isS3Configured()) {
      await deleteS3File(url);
    }
  } catch {
    console.warn(`Failed to delete file: ${url}`);
  }
}
