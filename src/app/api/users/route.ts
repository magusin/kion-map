import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { userCreateSchema } from "@/lib/validation";

const userSelect = { id: true, username: true, displayName: true, role: true, createdAt: true } as const;

export const GET = handle(async () => {
  await requireApiUser("ADMIN");
  return NextResponse.json(await prisma.user.findMany({ select: userSelect, orderBy: { username: "asc" } }));
});

export const POST = handle(async (req: Request) => {
  await requireApiUser("ADMIN");
  const { password, ...data } = userCreateSchema.parse(await readJson(req));
  const taken = await prisma.user.findFirst({ where: { username: { equals: data.username, mode: "insensitive" } } });
  if (taken) throw new ApiError(409, "Cet identifiant existe déjà");
  const user = await prisma.user.create({
    data: { ...data, passwordHash: await bcrypt.hash(password, 10) },
    select: userSelect,
  });
  return NextResponse.json(user, { status: 201 });
});
