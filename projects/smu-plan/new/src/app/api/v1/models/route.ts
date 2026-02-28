import { NextRequest } from "next/server";
import { verifyApiToken, isModelAllowed } from "@/lib/tokens/verify";
import { AVAILABLE_MODELS } from "@/lib/ai/client";

// GET /api/v1/models — List available models (OpenAI compatible)
export async function GET(req: NextRequest) {
  const token = await verifyApiToken(req.headers.get("authorization"));
  if (!token) {
    return Response.json(
      { error: { message: "Invalid API key", type: "invalid_request_error" } },
      { status: 401 }
    );
  }

  const models = AVAILABLE_MODELS.filter((m) => isModelAllowed(token, m));

  return Response.json({
    object: "list",
    data: models.map((id) => ({
      id,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: "longcat",
    })),
  });
}
