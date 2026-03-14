import { NextRequest } from "next/server";

import { requireUser, handleAuthError } from "@/lib/auth/guard";
import {
  ARTICLE_ATTACHMENT_RULES,
  UploadError,
  saveFile,
  validateFile,
} from "@/lib/upload";

export async function POST(req: NextRequest) {
  try {
    await requireUser(req);

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return Response.json(
        { ok: false, error: { code: 400, message: "缺少文件" } },
        { status: 400 },
      );
    }

    validateFile(file, ARTICLE_ATTACHMENT_RULES);

    const url = await saveFile(file, "wiki-attachments", {
      originalName: file.name,
    });

    return Response.json(
      { ok: true, data: { url, name: file.name } },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof UploadError) {
      return Response.json(
        { ok: false, error: { code: err.status, message: err.message } },
        { status: err.status },
      );
    }

    return handleAuthError(err);
  }
}
