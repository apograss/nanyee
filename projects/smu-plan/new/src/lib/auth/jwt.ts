import { SignJWT, jwtVerify, type JWTPayload } from "jose";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Set it in your .env file or environment.`
    );
  }
  return value;
}

const ACCESS_TTL = "15m";
const REFRESH_TTL = "30d";

function getAccessSecret() {
  return new TextEncoder().encode(requireEnv("JWT_ACCESS_SECRET"));
}

function getRefreshSecret() {
  return new TextEncoder().encode(requireEnv("JWT_REFRESH_SECRET"));
}

export interface AccessTokenPayload extends JWTPayload {
  sub: string; // userId
  role: string;
  username: string;
}

export interface RefreshTokenPayload extends JWTPayload {
  sub: string; // userId
  sid: string; // sessionId
}

export async function signAccessToken(payload: {
  userId: string;
  role: string;
  username: string;
}): Promise<string> {
  return new SignJWT({
    sub: payload.userId,
    role: payload.role,
    username: payload.username,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(getAccessSecret());
}

export async function signRefreshToken(payload: {
  userId: string;
  sessionId: string;
}): Promise<string> {
  return new SignJWT({
    sub: payload.userId,
    sid: payload.sessionId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TTL)
    .sign(getRefreshSecret());
}

export async function verifyAccessToken(
  token: string
): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAccessSecret());
    return payload as AccessTokenPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(
  token: string
): Promise<RefreshTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getRefreshSecret());
    return payload as RefreshTokenPayload;
  } catch {
    return null;
  }
}
