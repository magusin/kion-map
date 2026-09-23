import { NextResponse } from "next/server";
import { handle, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { readRows, importRows } from "@/lib/excel";

export const POST = handle(async (req: Request) => {
  await requireApiUser("MODERATOR");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Aucun fichier reçu");
  // Vercel limite le corps des requêtes à 4,5 Mo.
  if (file.size > 4 * 1024 * 1024) throw new ApiError(400, "Fichier trop volumineux (4 Mo max)");
  const rows = await readRows(file);
  return NextResponse.json(await importRows(rows));
});
