export interface CloudMailGatewayConfig {
  baseUrl: string;
  token: string;
}

export function getCloudMailGatewayConfig(
  env: Partial<Record<string, string | undefined>> = process.env,
): CloudMailGatewayConfig | null {
  const baseUrl =
    env.CLOUDMAIL_GATEWAY_URL?.trim() ||
    env.CLOUDMAIL_API_BASE_URL?.trim() ||
    "";
  const token =
    env.CLOUDMAIL_GATEWAY_TOKEN?.trim() ||
    env.CLOUDMAIL_SHARED_SECRET?.trim() ||
    "";

  if (!baseUrl || !token) {
    return null;
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    token,
  };
}

export function getVerificationDeliveryMode(
  env: Partial<Record<string, string | undefined>> = process.env,
): "cloudmail" | "resend" | "disabled" {
  if (getCloudMailGatewayConfig(env)) {
    return "cloudmail";
  }

  const resendKey =
    env.RESEND_API_KEY?.trim() ||
    env.RESEND_API_KEYS
      ?.split(",")
      .map((value) => value.trim())
      .find(Boolean);

  return resendKey ? "resend" : "disabled";
}

export async function sendVerificationEmailViaCloudMail(
  payload: Record<string, unknown>,
  env: Partial<Record<string, string | undefined>> = process.env,
) {
  const config = getCloudMailGatewayConfig(env);
  if (!config) {
    throw new Error("CloudMail gateway is not configured");
  }

  const response = await fetch(
    `${config.baseUrl}/api/gateway/verification-email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
        "X-Gateway-Token": config.token,
      },
      body: JSON.stringify(payload),
    },
  );

  if (response.ok) {
    return;
  }

  const errorText = await response.text();
  throw new Error(
    `CloudMail gateway rejected verification email: ${response.status} ${errorText}`,
  );
}
