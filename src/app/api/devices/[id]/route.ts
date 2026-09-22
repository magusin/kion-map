import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, readJson, parseId } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { deviceSchema } from "@/lib/validation";
import { deviceInclude, resolvePlacement } from "@/lib/devices";
import { normalizeDeviceType } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  await requireApiUser();
  const id = parseId((await params).id);
  return NextResponse.json(await prisma.device.findUniqueOrThrow({ where: { id }, include: deviceInclude }));
});

/** Mise à jour partielle : seuls les champs envoyés sont modifiés. */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  await requireApiUser("MODERATOR");
  const id = parseId((await params).id);
  const body = (await readJson(req)) as Record<string, unknown>;
  const data = deviceSchema.partial().parse(body);
  const current = await prisma.device.findUniqueOrThrow({ where: { id } });

  const placementTouched = ["planId", "zoneId", "x", "y"].some((k) => k in body);
  const planId = "planId" in body ? (data.planId ?? null) : current.planId;
  // Changement de plan sans nouvelle position : l'appareil n'est plus placé.
  const keepPosition = planId === current.planId;
  const placement = placementTouched
    ? await resolvePlacement({
        planId,
        zoneId: "zoneId" in body ? (data.zoneId ?? null) : keepPosition ? current.zoneId : null,
        x: "x" in body ? (data.x ?? null) : keepPosition ? current.x : null,
        y: "y" in body ? (data.y ?? null) : keepPosition ? current.y : null,
      })
    : {};

  // Ne garder que les champs réellement fournis (zod remplit les absents avec null/défaut).
  const fields = Object.fromEntries(
    Object.entries(data).filter(([k]) => k in body && !["planId", "zoneId", "x", "y"].includes(k)),
  );
  if (typeof fields.type === "string") fields.type = normalizeDeviceType(fields.type);

  const device = await prisma.device.update({
    where: { id },
    data: { ...fields, ...placement },
    include: deviceInclude,
  });
  return NextResponse.json(device);
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await requireApiUser("MODERATOR");
  const id = parseId((await params).id);
  await prisma.device.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
