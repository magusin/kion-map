import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { handle, readJson, parseId, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { userUpdateSchema } from "@/lib/validation";

const userSelect = { id: true, username: true, displayName: true, role: true, createdAt: true } as const;
type Ctx = { params: Promise<{ id: string }> };

async function lastAdminGuard(userId: number, action: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "Utilisateur introuvable");
  if (user.role === "ADMIN" && (await prisma.user.count({ where: { role: "ADMIN" } })) <= 1) {
    throw new ApiError(400, `Impossible de ${action} le dernier super admin`);
  }
}

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  await requireApiUser("ADMIN");
  const id = parseId((await params).id);
  const { password, ...data } = userUpdateSchema.parse(await readJson(req));
  if (data.role && data.role !== "ADMIN") {
    const target = await prisma.user.findUnique({ where: { id } });
    if (target?.role === "ADMIN") await lastAdminGuard(id, "rétrograder");
  }
  const user = await prisma.user.update({
    where: { id },
    data: { ...data, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
    select: userSelect,
  });
  return NextResponse.json(user);
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const me = await requireApiUser("ADMIN");
  const id = parseId((await params).id);
  if (id === me.id) throw new ApiError(400, "Vous ne pouvez pas supprimer votre propre compte");
  await lastAdminGuard(id, "supprimer");
  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
