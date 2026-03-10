import { NextRequest } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const filePath = path.join(UPLOAD_DIR, ...segments);

  // Security: prevent path traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(UPLOAD_DIR))) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const fileStat = await stat(resolved);
    if (!fileStat.isFile()) {
      return new Response("Not Found", { status: 404 });
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_MAP[ext] || "application/octet-stream";
    const data = await readFile(resolved);

    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(data.length),
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
