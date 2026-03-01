import { prisma } from "@/lib/prisma";

const PUBLIC_KEYS = [
  "site_name",
  "site_description",
  "navLinks",
  "footerContent",
  "homeSections",
];

export async function GET() {
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: PUBLIC_KEYS } },
  });

  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  return Response.json({ ok: true, data: { settings } });
}
