import CheckAdminClient from "./admin-client";
import type { AdminAccountItem, AdminOverviewPayload } from "./admin-client";
import { getAdminAiAccounts, getAdminAiMonitorOverview } from "@/lib/check/queries";

export const dynamic = "force-dynamic";

export default async function CheckAdminPage() {
  const [overview, accounts] = await Promise.all([
    getAdminAiMonitorOverview(),
    getAdminAiAccounts({ provider: "chatgpt", status: "", page: 1, limit: 50 }),
  ]);

  const initialOverview = JSON.parse(JSON.stringify(overview.data)) as AdminOverviewPayload;
  const initialAccounts = JSON.parse(JSON.stringify(accounts.data.items)) as AdminAccountItem[];

  return <CheckAdminClient initialOverview={initialOverview} initialAccounts={initialAccounts} />;
}
