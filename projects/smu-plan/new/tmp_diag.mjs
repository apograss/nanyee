import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

// 1. Check ALL articles (not just published)
const allArts = await p.article.findMany({
  select: { id: true, title: true, status: true, slug: true, createdAt: true },
  orderBy: { createdAt: "desc" },
  take: 10,
});
console.log("=== All recent articles ===");
for (const a of allArts) {
  console.log(`  [${a.status}] "${a.title}" (slug: ${a.slug}, created: ${a.createdAt.toISOString()})`);
}

// 2. Check recent search_knowledge tool runs
const runs = await p.toolRun.findMany({
  where: { toolName: "search_knowledge" },
  orderBy: { createdAt: "desc" },
  take: 5,
});
console.log("\n=== Recent search_knowledge ToolRuns ===");
for (const r of runs) {
  console.log(`  [${r.success ? "OK" : "FAIL"}] input=${r.input} output=${r.output.slice(0, 120)} (${r.createdAt.toISOString()})`);
}

// 3. Simulate search for "田峰宇"
const published = await p.article.findMany({
  where: { status: "published" },
  select: { id: true, title: true, summary: true, slug: true, content: true },
});
console.log(`\n=== Simulated search for "田峰宇" ===`);
console.log(`Published count: ${published.length}`);
const kw = "田峰宇";
for (const a of published) {
  const searchable = `${a.title} ${a.summary || ""} ${a.content}`;
  const found = searchable.includes(kw);
  console.log(`  "${a.title}" contains "${kw}": ${found}`);
}

await p.$disconnect();
