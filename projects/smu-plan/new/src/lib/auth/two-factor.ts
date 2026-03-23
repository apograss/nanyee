import { createHash, randomBytes } from "node:crypto";

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";

import { decryptKey, encryptKey } from "@/lib/keys/selector";

const TWO_FACTOR_TTL = "10m";
const ISSUER = "Nanyee.de";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getTwoFactorJwtSecret() {
  const secret = process.env.JWT_TWO_FACTOR_SECRET || requireEnv("JWT_ACCESS_SECRET");
  return new TextEncoder().encode(secret);
}

export interface TwoFactorChallengePayload extends JWTPayload {
  sub: string;
  username: string;
  role: string;
  purpose: "login-2fa";
}

export function generateTwoFactorSecret() {
  return generateSecret();
}

export function buildTwoFactorOtpAuthUri(accountName: string, secret: string) {
  return generateURI({
    issuer: ISSUER,
    label: accountName,
    secret,
    period: 30,
  });
}

export async function buildTwoFactorQrCodeDataUrl(otpAuthUrl: string) {
  return QRCode.toDataURL(otpAuthUrl, {
    margin: 1,
    width: 280,
    color: {
      dark: "#16345c",
      light: "#fffaf0",
    },
  });
}

export function encryptTwoFactorSecret(secret: string) {
  return encryptKey(secret);
}

export function decryptTwoFactorSecret(cipher: string) {
  return decryptKey(cipher);
}

export function verifyTwoFactorTotp(secret: string, code: string) {
  const result = verifySync({
    token: code.replace(/\s+/g, ""),
    secret,
    epochTolerance: 30,
  });
  return result.valid;
}

export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const left = randomBytes(3).toString("hex").toUpperCase();
    const right = randomBytes(3).toString("hex").toUpperCase();
    return `${left}-${right}`;
  });
}

export function hashRecoveryCode(code: string) {
  return createHash("sha256")
    .update(code.trim().toUpperCase())
    .digest("hex");
}

export function consumeRecoveryCode(
  recoveryCodesHashJson: string | null | undefined,
  candidate: string,
) {
  const hashes: string[] = recoveryCodesHashJson ? JSON.parse(recoveryCodesHashJson) : [];
  const hashedCandidate = hashRecoveryCode(candidate);
  const matchIndex = hashes.findIndex((item) => item === hashedCandidate);

  if (matchIndex < 0) {
    return {
      matched: false,
      nextRecoveryCodesHashJson: recoveryCodesHashJson ?? null,
    };
  }

  const nextHashes = hashes.filter((_, index) => index !== matchIndex);
  return {
    matched: true,
    nextRecoveryCodesHashJson: JSON.stringify(nextHashes),
  };
}

export async function signTwoFactorChallenge(payload: {
  userId: string;
  username: string;
  role: string;
}) {
  return new SignJWT({
    sub: payload.userId,
    username: payload.username,
    role: payload.role,
    purpose: "login-2fa",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TWO_FACTOR_TTL)
    .sign(getTwoFactorJwtSecret());
}

export async function verifyTwoFactorChallenge(token: string) {
  try {
    const { payload } = await jwtVerify(token, getTwoFactorJwtSecret());
    if (payload.purpose !== "login-2fa" || !payload.sub) {
      return null;
    }
    return payload as TwoFactorChallengePayload;
  } catch {
    return null;
  }
}
