import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

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
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") return NextResponse.json({ error: "Cet élément existe déjà (nom en double)" }, { status: 409 });
        if (err.code === "P2025") return NextResponse.json({ error: "Élément introuvable" }, { status: 404 });
        if (err.code === "P2003") return NextResponse.json({ error: "Référence invalide (plan ou zone)" }, { status: 400 });
      }
      console.error(err);
      return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
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
