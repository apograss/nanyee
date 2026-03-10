export interface CheckConfig {
  publicHost: string;
  cronSecret: string;
  cpaBaseUrl: string;
  cpaApiKey: string;
  newApiBaseUrl: string;
  newApiApiKey: string;
  grokBaseUrl: string;
  grokApiKey: string;
  grokAdminBaseUrl: string;
  grokAdminApiKey: string;
  chatgptAuthDir: string;
  grokResultDir: string;
  grokTokenFile: string;
  newApiAdminUrl: string;
  grokAdminUrl: string;
}

export function getCheckConfig(): CheckConfig {
  return {
    publicHost: process.env.CHECK_PUBLIC_HOST || "check.nanyee.de",
    cronSecret: process.env.CHECK_CRON_SECRET || "",
    cpaBaseUrl: trimTrailingSlash(process.env.CHECK_CPA_BASE_URL || "http://127.0.0.1:8317"),
    cpaApiKey: process.env.CHECK_CPA_API_KEY || process.env.CPA_API_KEY || "",
    newApiBaseUrl: trimTrailingSlash(process.env.CHECK_NEW_API_BASE_URL || "http://127.0.0.1:3001"),
    newApiApiKey: process.env.CHECK_NEW_API_API_KEY || process.env.AI_API_KEY || "",
    grokBaseUrl: trimTrailingSlash(process.env.CHECK_GROK_BASE_URL || "http://127.0.0.1:8000"),
    grokApiKey: process.env.CHECK_GROK_API_KEY || "",
    grokAdminBaseUrl: trimTrailingSlash(process.env.CHECK_GROK_ADMIN_BASE_URL || process.env.CHECK_GROK_BASE_URL || "http://127.0.0.1:8000"),
    grokAdminApiKey: process.env.CHECK_GROK_ADMIN_API_KEY || "",
    chatgptAuthDir: process.env.CHECK_CHATGPT_AUTH_DIR || "/opt/cpamc/auths",
    grokResultDir: process.env.CHECK_GROK_RESULT_DIR || "/opt/grok2api/result_grok",
    grokTokenFile: process.env.CHECK_GROK_TOKEN_FILE || "/opt/grok2api/data/token.json",
    newApiAdminUrl:
      process.env.CHECK_NEW_API_ADMIN_URL ||
      process.env.NEXT_PUBLIC_NEW_API_ADMIN_URL ||
      "https://api.nanyee.de",
    grokAdminUrl:
      process.env.CHECK_GROK_ADMIN_URL ||
      process.env.NEXT_PUBLIC_GROK_ADMIN_URL ||
      "",
  };
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
