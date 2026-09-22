import { NextResponse } from "next/server";
import { handle, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { readRows, importRows } from "@/lib/excel";

export const POST = handle(async (req: Request) => {
  await requireApiUser("MODERATOR");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Aucun fichier reçu");
  if (file.size > 10 * 1024 * 1024) throw new ApiError(400, "Fichier trop volumineux (10 Mo max)");
  const rows = await readRows(file);
  return NextResponse.json(await importRows(rows));
});
