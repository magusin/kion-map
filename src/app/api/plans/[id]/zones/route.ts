import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, readJson, parseId } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { zoneSchema } from "@/lib/validation";
import { recomputeDeviceZones } from "@/lib/devices";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  await requireApiUser("MODERATOR");
  const planId = parseId((await params).id);
  const data = zoneSchema.parse(await readJson(req));
  const zone = await prisma.zone.create({ data: { ...data, planId } });
  await recomputeDeviceZones(planId);
  return NextResponse.json(zone, { status: 201 });
});
