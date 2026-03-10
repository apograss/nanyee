import {
  getVerificationDeliveryMode,
  sendVerificationEmailViaCloudMail,
} from "./cloudmail";

export type VerificationPurpose =
  | "register"
  | "reset"
  | "bind"
  | "change_old"
  | "change_new";

interface SendVerificationEmailOptions {
  to: string;
  code: string;
  purpose: VerificationPurpose;
}

interface VerificationMailConfig {
  apiKey: string;
  from: string;
}

const DEFAULT_FROM = "nanyee.de <noreply@nanyee.de>";

const SUBJECT_MAP: Record<VerificationPurpose, string> = {
  register: "注册验证码",
  reset: "密码重置验证码",
  bind: "邮箱绑定验证码",
  change_old: "邮箱换绑确认（旧邮箱）",
  change_new: "邮箱换绑验证码（新邮箱）",
};

export function getVerificationMailConfig(
  env: Partial<Record<string, string | undefined>> = process.env,
): VerificationMailConfig | null {
  const singleKey = env.RESEND_API_KEY?.trim();
  const pooledKey = env.RESEND_API_KEYS
    ?.split(",")
    .map((value) => value.trim())
    .find(Boolean);
  const apiKey = singleKey || pooledKey;

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    from: env.RESEND_FROM?.trim() || DEFAULT_FROM,
  };
}

export function isVerificationMailConfigured(
  env: Partial<Record<string, string | undefined>> = process.env,
): boolean {
  return getVerificationDeliveryMode(env) !== "disabled";
}

export function getVerificationEmailSubject(
  purpose: VerificationPurpose,
  code: string,
): string {
  return `[nanyee.de] ${SUBJECT_MAP[purpose]}: ${code}`;
}

export async function sendVerificationEmail({
  to,
  code,
  purpose,
}: SendVerificationEmailOptions) {
  const deliveryMode = getVerificationDeliveryMode();

  if (deliveryMode === "cloudmail") {
    await sendVerificationEmailViaCloudMail({
      to,
      code,
      purpose,
      subject: getVerificationEmailSubject(purpose, code),
    });
    return;
  }

  if (deliveryMode === "disabled") {
    throw new Error("Verification email provider is not configured");
  }

  const config = getVerificationMailConfig();
  if (!config) {
    throw new Error("Verification email provider is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [to],
      subject: getVerificationEmailSubject(purpose, code),
      text: `您的验证码是: ${code}\n\n10 分钟内有效。如非本人操作请忽略。`,
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1D3557;">nanyee.de ${SUBJECT_MAP[purpose]}</h2>
          <p style="font-size: 32px; font-weight: bold; color: #E8652B; letter-spacing: 4px;">${code}</p>
          <p style="color: #666;">10 分钟内有效。如非本人操作请忽略此邮件。</p>
        </div>
      `,
    }),
  });

  if (response.ok) {
    return;
  }

  const errorText = await response.text();
  throw new Error(`Failed to send email: ${response.status} ${errorText}`);
}
