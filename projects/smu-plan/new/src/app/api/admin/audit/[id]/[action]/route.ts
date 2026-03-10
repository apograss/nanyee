import { NextRequest } from "next/server";

// POST /api/admin/audit/[id]/[action] — RETIRED
// The submit→review→publish workflow has been replaced by wiki-style open editing.
export async function POST(
  _req: NextRequest,
  { params: _params }: { params: Promise<{ id: string; action: string }> }
) {
  return Response.json(
    { ok: false, error: { code: 410, message: "审核工作流已停用。文章现在采用 Wiki 模式，登录用户可直接编辑。" } },
    { status: 410 }
  );
}
