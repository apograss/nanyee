interface ProviderLike {
  provider: string;
  totalAccounts: number;
  healthyAccounts: number;
  invalidAccounts: number;
  rateLimitedAccounts: number;
  successRate24h: number;
  requests24h: number;
}

export function buildPublicOverviewMetrics(providers: ProviderLike[]) {
  const totalAccounts = providers.reduce((sum, item) => sum + item.totalAccounts, 0);
  const healthyAccounts = providers.reduce((sum, item) => sum + item.healthyAccounts, 0);
  const invalidAccounts = providers.reduce((sum, item) => sum + item.invalidAccounts, 0);
  const rateLimitedAccounts = providers.reduce((sum, item) => sum + item.rateLimitedAccounts, 0);
  const totalRequests24h = providers.reduce((sum, item) => sum + item.requests24h, 0);
  const averageSuccessRate24h = providers.length
    ? Math.round(
        providers.reduce((sum, item) => sum + item.successRate24h, 0) / providers.length
      )
    : 0;

  return {
    totalAccounts,
    healthyAccounts,
    invalidAccounts,
    rateLimitedAccounts,
    attentionAccounts: invalidAccounts + rateLimitedAccounts,
    totalRequests24h,
    averageSuccessRate24h,
    healthPercent: totalAccounts ? Math.round((healthyAccounts / totalAccounts) * 100) : 0,
  };
}
