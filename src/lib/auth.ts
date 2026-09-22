import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { SESSION_COOKIE, verifySession } from "./session";
import { hasRole, type Role, type SessionUser } from "./roles";
import { ApiError } from "./api";

// L'utilisateur est relu en base à chaque requête : un changement de rôle
// ou une suppression de compte prend effet immédiatement.
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const uid = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  return prisma.user.findUnique({
    where: { id: uid },
    select: { id: true, username: true, displayName: true, role: true },
  });
});

/** Pour les pages : redirige vers /login ou l'accueil si les droits manquent. */
export async function requirePageUser(min: Role = "VIEWER"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasRole(user.role, min)) redirect("/");
  return user;
}

/** Pour les route handlers : lève une ApiError 401/403. */
export async function requireApiUser(min: Role = "VIEWER"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Non authentifié");
  if (!hasRole(user.role, min)) throw new ApiError(403, "Droits insuffisants");
  return user;
}
