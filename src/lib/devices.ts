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

/** Les noms d'appareils et de plans sont uniques sans tenir compte de la casse. */
export async function assertNameFree(kind: "device" | "plan", name: string, exceptId?: number) {
  const where = { name: { equals: name, mode: "insensitive" as const }, ...(exceptId ? { NOT: { id: exceptId } } : {}) };
  const taken = kind === "device" ? await prisma.device.findFirst({ where }) : await prisma.plan.findFirst({ where });
  if (taken) throw new ApiError(409, `« ${taken.name} » existe déjà`);
}

export function searchWhere(q: string | null | undefined): Prisma.DeviceWhereInput {
  const term = q?.trim();
  if (!term) return {};
  const fields = ["name", "ip", "mac", "assignedUser", "description", "location", "type"] as const;
  return {
    OR: [
      ...fields.map((f) => ({ [f]: { contains: term, mode: "insensitive" as const } })),
      { zone: { name: { contains: term, mode: "insensitive" } } },
      { plan: { name: { contains: term, mode: "insensitive" } } },
    ],
  };
}

/**
 * Placement automatique d'appareils dans une zone dessinée : emplacements libres
 * pris en grille (ligne par ligne, depuis le coin supérieur gauche), à l'écart des
 * appareils déjà présents et hors des sous-zones (l'appareil doit tomber dans cette
 * zone précise, pas dans une zone plus petite incluse dedans).
 * Les positions sont mémorisées : plusieurs appels successifs ne se superposent pas.
 */
export class AutoPlacer {
  private zones = new Map<number, { id: number; points: Point[] }[]>();
  private occupied = new Map<number, Point[]>();

  private async load(planId: number) {
    if (!this.zones.has(planId)) {
      const zones = await prisma.zone.findMany({ where: { planId }, select: { id: true, points: true } });
      this.zones.set(planId, zones.map((z) => ({ id: z.id, points: (z.points as Point[]) ?? [] })));
      const devices = await prisma.device.findMany({
        where: { planId, x: { not: null }, y: { not: null } },
        select: { x: true, y: true },
      });
      this.occupied.set(planId, devices.map((d) => [d.x!, d.y!] as Point));
    }
    return { zones: this.zones.get(planId)!, occupied: this.occupied.get(planId)! };
  }

  /** Oublie le plan (zones redessinées entre-temps). */
  reset(planId: number) {
    this.zones.delete(planId);
    this.occupied.delete(planId);
  }

  /** La zone a-t-elle un contour ? */
  async isDrawn(planId: number, zoneId: number) {
    const { zones } = await this.load(planId);
    return (zones.find((z) => z.id === zoneId)?.points.length ?? 0) >= 3;
  }

  /** Le point est-il dans le contour de la zone ? */
  async contains(planId: number, zoneId: number, x: number, y: number) {
    const { zones } = await this.load(planId);
    const pts = zones.find((z) => z.id === zoneId)?.points ?? [];
    return pts.length >= 3 && pointInPolygon(x, y, pts);
  }

  /** Premier emplacement libre dans la zone, réservé pour les appels suivants ; null si la zone n'est pas dessinée. */
  async spot(planId: number, zoneId: number): Promise<Point | null> {
    const { zones, occupied } = await this.load(planId);
    const pts = zones.find((z) => z.id === zoneId)?.points ?? [];
    if (pts.length < 3) return null;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const inZone = (x: number, y: number) => pickZone(zones, x, y) === zoneId;

    // Grille de plus en plus serrée. Plus large que haute : le nom s'affiche sous l'icône
    // et prend environ 80 unités de large.
    for (const [sx, sy] of [[90, 60], [70, 50], [45, 35], [25, 20], [12, 12]]) {
      const margin = Math.min(35, sy);
      const top = minY + margin + 15; // sous le nom de la zone
      for (let y = top; y <= maxY - margin; y += sy) {
        for (let x = minX + margin; x <= maxX - margin; x += sx) {
          if (!inZone(x, y)) continue;
          if (occupied.some(([ox, oy]) => Math.abs(ox - x) < sx * 0.9 && Math.abs(oy - y) < sy * 0.9)) continue;
          const p: Point = [Math.round(x), Math.round(y)];
          occupied.push(p);
          return p;
        }
      }
    }
    // Zone pleine ou très petite : n'importe quel point de la zone (superposition possible).
    for (let y = minY + 2; y <= maxY - 2; y += 4) {
      for (let x = minX + 2; x <= maxX - 2; x += 4) {
        if (inZone(x, y)) {
          const p: Point = [Math.round(x), Math.round(y)];
          occupied.push(p);
          return p;
        }
      }
    }
    return null;
  }
}

/**
 * Place dans la zone (qui vient d'être dessinée) ses appareils rattachés mais sans position,
 * par exemple ceux créés par un import Excel avant que le contour existe.
 */
export async function placeWaitingDevices(zoneId: number, planId: number): Promise<number> {
  const waiting = await prisma.device.findMany({
    where: { zoneId, planId, OR: [{ x: null }, { y: null }] },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  if (!waiting.length) return 0;
  const placer = new AutoPlacer();
  let placed = 0;
  for (const d of waiting) {
    const p = await placer.spot(planId, zoneId);
    if (!p) break;
    await prisma.device.update({ where: { id: d.id }, data: { x: p[0], y: p[1], zoneId } });
    placed++;
  }
  return placed;
}
