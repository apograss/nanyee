import { buildOidcDiscoveryDocument, resolveOidcIssuer } from "@/lib/oidc/config";

export async function GET(req: Request) {
  const issuer = resolveOidcIssuer(req.url, req.headers);
  const document = buildOidcDiscoveryDocument(issuer);

  return Response.json(document, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
