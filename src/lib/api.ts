import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { ConfigError } from "./errors";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}


// Erreurs de base de données dues à la configuration ou au déploiement.
const DB_ERRORS: Record<string, string> = {
  P2021: "Base de données non initialisée : les tables n'existent pas. Les migrations doivent être appliquées (prisma migrate deploy).",
  P1000: "Connexion à la base refusée : identifiant ou mot de passe de DATABASE_URL invalide.",
  P1001: "Serveur de base de données injoignable : vérifiez l'hôte de DATABASE_URL.",
  P1002: "Serveur de base de données trop lent à répondre (délai dépassé).",
  P1003: "La base indiquée dans DATABASE_URL n'existe pas.",
  P1010: "Accès refusé à la base de données pour cet utilisateur.",
  P1011: "Erreur TLS lors de la connexion à la base de données.",
  P1017: "La connexion à la base de données a été fermée par le serveur.",
};

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Convertit les erreurs connues en réponses JSON propres. */
export function handle<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof ZodError) {
        const msg = err.issues.map((i) => (i.path.length ? `${i.path.join(".")} : ${i.message}` : i.message)).join(", ");
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      if (err instanceof ConfigError) {
        console.error(err.message);
        return NextResponse.json({ error: `Configuration du serveur : ${err.message}` }, { status: 500 });
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && DB_ERRORS[err.code]) {
        console.error(err);
        return NextResponse.json({ error: DB_ERRORS[err.code] }, { status: 503 });
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") return NextResponse.json({ error: "Cet élément existe déjà (nom en double)" }, { status: 409 });
        if (err.code === "P2025") return NextResponse.json({ error: "Élément introuvable" }, { status: 404 });
        if (err.code === "P2003") return NextResponse.json({ error: "Référence invalide (plan ou zone)" }, { status: 400 });
      }
      console.error(err);
      return NextResponse.json({ error: "Erreur serveur (voir les logs du serveur, ou /api/health pour un diagnostic)" }, { status: 500 });
    }
  };
}

export function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Identifiant invalide");
  return id;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "Corps JSON invalide");
  }
}
