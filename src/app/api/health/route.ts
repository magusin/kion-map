import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

// Diagnostic du déploiement, accessible sans connexion.
// Ne renvoie que des états (ok / problème), jamais de valeur de configuration.
export const dynamic = "force-dynamic";

type Check = { ok: boolean; detail: string };

export async function GET() {
  const checks: Record<string, Check> = {};

  const secret = process.env.SESSION_SECRET;
  checks.sessionSecret = secret && secret.length >= 16
    ? { ok: true, detail: "défini" }
    : { ok: false, detail: "SESSION_SECRET manquant ou trop court (16 caractères minimum)" };

  if (!process.env.DATABASE_URL) {
    checks.database = { ok: false, detail: "DATABASE_URL manquant" };
  } else {
    try {
      const admins = await prisma.user.count({ where: { role: "ADMIN" } });
      checks.database = { ok: true, detail: "connexion et tables OK" };
      checks.superAdmin = admins > 0
        ? { ok: true, detail: "présent" }
        : { ok: false, detail: "aucun super admin : définissez ADMIN_PASSWORD puis redéployez (ou lancez npm run db:seed)" };
    } catch (err) {
      const code = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined;
      const detail =
        code === "P2021" ? "tables absentes : migrations non appliquées (prisma migrate deploy)"
        : code === "P1000" ? "identifiants de DATABASE_URL refusés"
        : code === "P1001" ? "serveur de base injoignable"
        : code === "P1003" ? "base de données inexistante"
        : `erreur ${code ?? (err as Error).name}`;
      checks.database = { ok: false, detail };
    }
  }

  checks.cookieSecure = process.env.COOKIE_SECURE === "true"
    ? { ok: true, detail: "true" }
    : { ok: process.env.NODE_ENV !== "production", detail: "COOKIE_SECURE devrait valoir true en production (HTTPS)" };

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
