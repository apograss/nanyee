import { importPKCS8, importSPKI, exportJWK, SignJWT, jwtVerify } from "jose";
import { generateKeyPairSync, createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const ALG = "RS256";
const KEYS_DIR = join(process.cwd(), ".oidc-keys");
const PRIVATE_KEY_PATH = join(KEYS_DIR, "private.pem");
const PUBLIC_KEY_PATH = join(KEYS_DIR, "public.pem");

let cachedPrivateKey: CryptoKey | null = null;
let cachedPublicKey: CryptoKey | null = null;
let cachedKid: string | null = null;

/**
 * Load or generate RSA-2048 key pair.
 * Priority: env vars > file system > auto-generate.
 */
function loadPemPair(): { privatePem: string; publicPem: string } {
  // 1. Try env vars
  if (process.env.OIDC_RSA_PRIVATE_KEY && process.env.OIDC_RSA_PUBLIC_KEY) {
    return {
      privatePem: process.env.OIDC_RSA_PRIVATE_KEY.replace(/\\n/g, "\n"),
      publicPem: process.env.OIDC_RSA_PUBLIC_KEY.replace(/\\n/g, "\n"),
    };
  }

  // 2. Try file system
  if (existsSync(PRIVATE_KEY_PATH) && existsSync(PUBLIC_KEY_PATH)) {
    return {
      privatePem: readFileSync(PRIVATE_KEY_PATH, "utf-8"),
      publicPem: readFileSync(PUBLIC_KEY_PATH, "utf-8"),
    };
  }

  // 3. Generate new key pair
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  if (!existsSync(KEYS_DIR)) {
    mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
  }
  writeFileSync(PRIVATE_KEY_PATH, privateKey as string, { mode: 0o600 });
  writeFileSync(PUBLIC_KEY_PATH, publicKey as string, { mode: 0o644 });

  console.log("[OIDC] Generated new RSA-2048 key pair in", KEYS_DIR);

  return { privatePem: privateKey as string, publicPem: publicKey as string };
}

function computeKid(publicPem: string): string {
  return createHash("sha256").update(publicPem).digest("hex").slice(0, 16);
}

export async function getPrivateKey(): Promise<CryptoKey> {
  if (cachedPrivateKey) return cachedPrivateKey;
  const { privatePem, publicPem } = loadPemPair();
  cachedPrivateKey = await importPKCS8(privatePem, ALG);
  cachedKid = computeKid(publicPem);
  return cachedPrivateKey;
}

export async function getPublicKey(): Promise<CryptoKey> {
  if (cachedPublicKey) return cachedPublicKey;
  const { publicPem } = loadPemPair();
  cachedPublicKey = await importSPKI(publicPem, ALG);
  cachedKid = computeKid(publicPem);
  return cachedPublicKey;
}

export async function getKid(): Promise<string> {
  if (cachedKid) return cachedKid;
  const { publicPem } = loadPemPair();
  cachedKid = computeKid(publicPem);
  return cachedKid;
}

/**
 * Return JWKS (JSON Web Key Set) containing the public key.
 */
export async function getJWKS() {
  const publicKey = await getPublicKey();
  const kid = await getKid();
  const jwk = await exportJWK(publicKey);

  return {
    keys: [
      {
        ...jwk,
        kid,
        alg: ALG,
        use: "sig",
      },
    ],
  };
}

/**
 * Sign an id_token JWT with RS256.
 */
export async function signIdToken(payload: Record<string, unknown>): Promise<string> {
  const privateKey = await getPrivateKey();
  const kid = await getKid();

  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALG, kid })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

/**
 * Verify a token signed with our RSA key (for testing).
 */
export async function verifyIdToken(token: string) {
  const publicKey = await getPublicKey();
  return jwtVerify(token, publicKey);
}
