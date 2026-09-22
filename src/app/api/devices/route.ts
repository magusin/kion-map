import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { deviceSchema } from "@/lib/validation";
import { deviceInclude, resolvePlacement, searchWhere } from "@/lib/devices";
import { normalizeDeviceType } from "@/lib/types";

export const GET = handle(async (req: Request) => {
  await requireApiUser();
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const planId = Number(url.searchParams.get("planId")) || undefined;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 500, 2000);
  const devices = await prisma.device.findMany({
    where: { AND: [searchWhere(url.searchParams.get("q")), type ? { type } : {}, planId ? { planId } : {}] },
    include: deviceInclude,
    orderBy: { name: "asc" },
    take: limit,
  });
  return NextResponse.json(devices);
});

export const POST = handle(async (req: Request) => {
  await requireApiUser("MODERATOR");
  const data = deviceSchema.parse(await readJson(req));
  const placement = await resolvePlacement(data);
  const device = await prisma.device.create({
    data: { ...data, ...placement, type: normalizeDeviceType(data.type) },
    include: deviceInclude,
  });
  return NextResponse.json(device, { status: 201 });
});
