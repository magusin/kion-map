import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/session";

// Limitation simple des tentatives (mémoire du process).
const attempts = new Map<string, { count: number; since: number }>();
const WINDOW = 15 * 60 * 1000;

const schema = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(200) });

export const POST = handle(async (req: Request) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  const entry = attempts.get(ip);
  if (entry && now - entry.since < WINDOW && entry.count >= 10) {
    throw new ApiError(429, "Trop de tentatives, réessayez dans quelques minutes");
  }

  const { username, password } = schema.parse(await readJson(req));
  const user = await prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    const e = entry && now - entry.since < WINDOW ? entry : { count: 0, since: now };
    e.count++;
    attempts.set(ip, e);
    throw new ApiError(401, "Identifiants invalides");
  }
  attempts.delete(ip);

  const res = NextResponse.json({ id: user.id, username: user.username, role: user.role });
  res.cookies.set(SESSION_COOKIE, await signSession(user.id), sessionCookieOptions);
  return res;
});
