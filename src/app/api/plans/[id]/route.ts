import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, readJson, parseId } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { planUpdateSchema } from "@/lib/validation";
import { deviceInclude } from "@/lib/devices";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  await requireApiUser();
  const id = parseId((await params).id);
  const plan = await prisma.plan.findUniqueOrThrow({
    where: { id },
    include: { zones: { orderBy: { name: "asc" } }, devices: { include: deviceInclude, orderBy: { name: "asc" } } },
  });
  return NextResponse.json(plan);
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  await requireApiUser("MODERATOR");
  const id = parseId((await params).id);
  const data = planUpdateSchema.parse(await readJson(req));
  const plan = await prisma.plan.update({ where: { id }, data });
  // L'image de fond (data URL volumineuse) n'est pas renvoyée.
  const { background, ...rest } = plan;
  return NextResponse.json({ ...rest, hasBackground: background !== null });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await requireApiUser("MODERATOR");
  const id = parseId((await params).id);
  // Les zones sont supprimées ; les appareils restent mais ne sont plus placés.
  await prisma.$transaction([
    prisma.device.updateMany({ where: { planId: id }, data: { x: null, y: null, zoneId: null } }),
    prisma.plan.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
});
