import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, readJson, parseId } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { zoneSchema } from "@/lib/validation";
import { recomputeDeviceZones } from "@/lib/devices";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  await requireApiUser("MODERATOR");
  const id = parseId((await params).id);
  const data = zoneSchema.partial().parse(await readJson(req));
  const zone = await prisma.zone.update({ where: { id }, data });
  if (data.points) await recomputeDeviceZones(zone.planId);
  return NextResponse.json(zone);
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await requireApiUser("MODERATOR");
  const id = parseId((await params).id);
  const zone = await prisma.zone.delete({ where: { id } });
  await recomputeDeviceZones(zone.planId);
  return NextResponse.json({ ok: true });
});
