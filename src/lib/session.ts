import { SignJWT, jwtVerify } from "jose";

// Utilisable depuis proxy.ts, les route handlers et les server components.
export const SESSION_COOKIE = "kion_session";
const DURATION_S = 12 * 60 * 60;

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET manquant ou trop court (voir .env.example)");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(userId: number) {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DURATION_S}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<number | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return typeof payload.uid === "number" ? payload.uid : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.COOKIE_SECURE === "true",
  path: "/",
  maxAge: DURATION_S,
};
