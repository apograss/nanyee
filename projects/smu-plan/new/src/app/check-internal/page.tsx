import PublicCheckClient from "./public-client";
import { getPublicCheckHistory, getPublicCheckSummary } from "@/lib/check/queries";

export const dynamic = "force-dynamic";

export default async function CheckPublicPage() {
  const [summary, history] = await Promise.all([getPublicCheckSummary(), getPublicCheckHistory(7)]);

  const initialSummary = JSON.parse(JSON.stringify(summary.data));
  const initialHistory = JSON.parse(JSON.stringify(history.data.series));

  return <PublicCheckClient initialSummary={initialSummary} initialHistory={initialHistory} />;
}
