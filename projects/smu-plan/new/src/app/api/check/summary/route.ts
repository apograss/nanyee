import { getPublicCheckSummary } from "@/lib/check/queries";

export async function GET() {
  try {
    return Response.json(await getPublicCheckSummary());
  } catch (error) {
    console.error("Public check summary error:", error);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}
