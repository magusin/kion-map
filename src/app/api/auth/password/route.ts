import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";

const schema = z.object({ current: z.string().min(1), password: z.string().min(8, "8 caractères minimum").max(200) });

export const PUT = handle(async (req: Request) => {
  const me = await requireApiUser();
  const { current, password } = schema.parse(await readJson(req));
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await bcrypt.compare(current, user.passwordHash))) throw new ApiError(400, "Mot de passe actuel incorrect");
  await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  return NextResponse.json({ ok: true });
});
