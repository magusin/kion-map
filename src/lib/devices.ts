import "server-only";
import { prisma } from "./prisma";
import { pointInPolygon, type Point } from "./types";
import { ApiError } from "./api";
import type { Prisma } from "@/generated/prisma/client";

export const deviceInclude = {
  plan: { select: { id: true, name: true } },
  zone: { select: { id: true, name: true, color: true } },
} satisfies Prisma.DeviceInclude;

type Placement = { planId: number | null; zoneId: number | null; x: number | null; y: number | null };

/** Zone du plan contenant le point (la plus petite si plusieurs se chevauchent). */
export async function zoneAt(planId: number, x: number, y: number): Promise<number | null> {
  const zones = await prisma.zone.findMany({ where: { planId }, select: { id: true, points: true } });
  return pickZone(zones, x, y);
}

function pickZone(zones: { id: number; points: unknown }[], x: number, y: number): number | null {
  let best: { id: number; area: number } | null = null;
  for (const z of zones) {
    const pts = z.points as Point[];
    if (pts.length >= 3 && pointInPolygon(x, y, pts)) {
      const area = polygonArea(pts);
      if (!best || area < best.area) best = { id: z.id, area };
    }
  }
  return best?.id ?? null;
}

function polygonArea(pts: Point[]) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a / 2);
}

/**
 * Rend cohérents plan / zone / position :
 * - un appareil positionné prend automatiquement la zone sous sa position ;
 * - une zone choisie sans position doit appartenir au plan (ou le définit) ;
 * - sans plan, ni zone ni position.
 */
export async function resolvePlacement(p: Placement): Promise<Placement> {
  let { planId } = p;
  const { zoneId } = p;
  const { x, y } = p;
  if (zoneId && !planId) {
    const zone = await prisma.zone.findUnique({ where: { id: zoneId }, select: { planId: true } });
    if (!zone) throw new ApiError(400, "Zone introuvable");
    planId = zone.planId;
  }
  if (!planId) return { planId: null, zoneId: null, x: null, y: null };
  const plan = await prisma.plan.findUnique({ where: { id: planId }, select: { id: true } });
  if (!plan) throw new ApiError(400, "Plan introuvable");
  if (x !== null && y !== null) return { planId, x, y, zoneId: await zoneAt(planId, x, y) };
  if (zoneId) {
    const zone = await prisma.zone.findUnique({ where: { id: zoneId }, select: { planId: true } });
    if (!zone || zone.planId !== planId) throw new ApiError(400, "La zone n'appartient pas à ce plan");
  }
  return { planId, zoneId, x: null, y: null };
}

/** Recalcule la zone des appareils positionnés d'un plan (après édition des zones). */
export async function recomputeDeviceZones(planId: number) {
  const devices = await prisma.device.findMany({
    where: { planId, x: { not: null }, y: { not: null } },
    select: { id: true, x: true, y: true, zoneId: true },
  });
  const zones = await prisma.zone.findMany({ where: { planId }, select: { id: true, points: true } });
  for (const d of devices) {
    const zoneId = pickZone(zones, d.x!, d.y!);
    if (zoneId !== d.zoneId) await prisma.device.update({ where: { id: d.id }, data: { zoneId } });
  }
}

export function searchWhere(q: string | null | undefined): Prisma.DeviceWhereInput {
  const term = q?.trim();
  if (!term) return {};
  const fields = ["name", "ip", "mac", "assignedUser", "description", "location", "type"] as const;
  return {
    OR: [
      ...fields.map((f) => ({ [f]: { contains: term } })),
      { zone: { name: { contains: term } } },
      { plan: { name: { contains: term } } },
    ],
  };
}
