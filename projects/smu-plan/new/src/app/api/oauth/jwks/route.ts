import { getJWKS } from "@/lib/oidc/keys";

export async function GET() {
  const jwks = await getJWKS();
  return Response.json(jwks, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
